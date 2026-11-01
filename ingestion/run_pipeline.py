"""
WCE Knowledge Base Ingestion Pipeline Runner
Orchestrates website crawling, screenshot handling, document extraction,
cleaning, authoritative overrides, deduplication, chunking, embedding,
vector database building, and ingestion reporting.
"""

import sys
import json
import time
from datetime import datetime
from pathlib import Path

# Fix Windows console encoding
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Module imports
from extract.scrape_website import scrape_wce_knowledge_base, TARGET_URLS
from extract.extract_screenshots import extract_screenshots
from extract.extract_documents import extract_documents
from processing.clean_data import clean_document_record
from processing.deduplicate import process_and_deduplicate
from processing.chunking import chunk_documents
from processing.metadata import standardize_doc_metadata
from embeddings.generate_embeddings import generate_embeddings_for_chunks
from vectorstore.build_index import build_vector_store

BASE_DIR = Path(__file__).resolve().parent
REPORTS_DIR = BASE_DIR / "reports"
BACKEND_DATA_DIR = BASE_DIR.parent / "backend" / "data"
PROCESSED_JSONL = BACKEND_DATA_DIR / "processed" / "wce_documents.jsonl"
MANIFEST_JSON = BACKEND_DATA_DIR / "manifest.json"

def load_existing_backend_documents():
    """
    Loads existing records from backend/data/processed/wce_documents.jsonl
    so existing useful knowledge is not discarded.
    """
    if not PROCESSED_JSONL.exists():
        return []
    records = []
    with open(PROCESSED_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except Exception:
                pass
    return records

def run_pipeline():
    start_time = time.time()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (BACKEND_DATA_DIR / "processed").mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print(" WCE KNOWLEDGE BASE INGESTION PIPELINE")
    print(f" Started at: {datetime.utcnow().isoformat()}Z")
    print("=" * 70)

    # 1. Crawl Website (20 target URLs + placement pages)
    print("\n--- STAGE 1: OFFICIAL WEBSITE CRAWL ---")
    scraped_docs, crawl_logs = scrape_wce_knowledge_base()

    # 2. Process Screenshots
    print("\n--- STAGE 2: SCREENSHOT EXTRACTION ---")
    screenshot_docs, screenshot_report = extract_screenshots()
    print(f"Screenshot Status: {screenshot_report['status']} - {screenshot_report['message']}")

    # 3. Extract Documents & PDFs
    print("\n--- STAGE 3: DOCUMENT & PDF EXTRACTION ---")
    pdf_docs, pdf_report = extract_documents()
    print(f"Extracted {len(pdf_docs)} PDF document pages.")

    # 4. Load Existing Knowledge
    print("\n--- STAGE 4: COMBINING EXISTING KNOWLEDGE ---")
    existing_docs = load_existing_backend_documents()
    print(f"Loaded {len(existing_docs)} existing documents from backend.")

    all_raw_docs = []
    all_raw_docs.extend(scraped_docs)
    all_raw_docs.extend(screenshot_docs)
    all_raw_docs.extend(pdf_docs)
    all_raw_docs.extend(existing_docs)

    # 5. Clean & Standardize
    print("\n--- STAGE 5: DATA CLEANING & METADATA STANDARDIZATION ---")
    cleaned_docs = [standardize_doc_metadata(clean_document_record(d)) for d in all_raw_docs]

    # 6. Apply Authoritative Overrides and Deduplicate
    print("\n--- STAGE 6: AUTHORITATIVE OVERRIDES & DEDUPLICATION ---")
    processed_docs = process_and_deduplicate(cleaned_docs)
    duplicate_count = len(cleaned_docs) - len(processed_docs)
    print(f"Total raw documents: {len(cleaned_docs)} -> Deduplicated documents: {len(processed_docs)} (Removed {duplicate_count} duplicates)")

    # Save to backend JSONL
    with open(PROCESSED_JSONL, "w", encoding="utf-8") as f:
        for d in processed_docs:
            f.write(json.dumps(d) + "\n")
    print(f"Saved processed dataset to: {PROCESSED_JSONL}")

    # Update manifest.json
    manifest = {
        "version": "2.0",
        "last_run": datetime.utcnow().isoformat() + "Z",
        "stats": {
            "total_urls_supplied": len(TARGET_URLS),
            "urls_crawled_successfully": len([l for l in crawl_logs if l["status_code"] == 200]),
            "urls_failed": len([l for l in crawl_logs if l["status_code"] != 200]),
            "screenshots_processed": len(screenshot_docs),
            "documents_indexed": len(processed_docs),
        },
        "urls": {l["target_url"]: l for l in crawl_logs}
    }
    with open(MANIFEST_JSON, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # 7. Chunking
    print("\n--- STAGE 7: CHUNKING (500 tokens, 80 overlap) ---")
    chunks = chunk_documents(processed_docs, chunk_tokens=500, overlap_tokens=80)
    print(f"Generated {len(chunks)} chunks across {len(processed_docs)} documents.")

    # 8. Embedding Generation
    print("\n--- STAGE 8: EMBEDDING GENERATION (384-dim) ---")
    embedded_chunks = generate_embeddings_for_chunks(chunks)

    # 9. Vector Database Build & Validation
    print("\n--- STAGE 9: VECTOR DATABASE BUILD & ATOMIC SWAP ---")
    vdb_result = build_vector_store(embedded_chunks)
    print(f"Vector Database Result: {vdb_result['status']} ({vdb_result['chunks_indexed']} chunks)")

    # 10. Generate Ingestion Report
    print("\n--- STAGE 10: GENERATING INGESTION REPORT ---")
    
    # Calculate counts
    faculty_count = sum(len(d.get("faculty_records", [])) for d in processed_docs)
    curriculum_count = sum(len(d.get("curriculum_records", [])) for d in processed_docs)
    admission_count = sum(len(d.get("admission_records", [])) for d in processed_docs)
    placement_count = sum(len(d.get("placement_records", [])) for d in processed_docs)
    tables_count = sum(d.get("tables_count", 0) for d in processed_docs)

    ingestion_report = {
        "pipeline_timestamp": datetime.utcnow().isoformat() + "Z",
        "execution_time_seconds": round(time.time() - start_time, 2),
        "urls_supplied_count": len(TARGET_URLS),
        "urls_crawled_count": len(crawl_logs),
        "urls_successfully_crawled": [l["target_url"] for l in crawl_logs if l["status_code"] == 200],
        "urls_failed": [l for l in crawl_logs if l["status_code"] != 200],
        "http_status_codes": {l["target_url"]: l["status_code"] for l in crawl_logs},
        "redirect_information": [l for l in crawl_logs if l.get("redirected")],
        "pages_with_incomplete_extraction": [l["target_url"] for l in crawl_logs if l["size_bytes"] < 500],
        "screenshots_processed_count": len(screenshot_docs),
        "screenshot_status_message": screenshot_report["message"],
        "documents_extracted_count": len(processed_docs),
        "tables_extracted_count": tables_count,
        "faculty_records_count": faculty_count,
        "curriculum_records_count": curriculum_count,
        "admission_records_count": admission_count,
        "placement_records_count": placement_count,
        "duplicate_records_removed": duplicate_count,
        "chunks_generated_count": len(chunks),
        "embeddings_generated_count": len(embedded_chunks),
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "embedding_dimensions": 384,
        "total_vectors_indexed": vdb_result["chunks_indexed"],
        "authoritative_corrections_count": 1,
        "authoritative_corrections_summary": [
            {
                "entity": "Information Technology Department",
                "attribute": "current_hod",
                "value": "Dr. U. B. Chavan",
                "status": "applied",
                "historical_note": "Dr. R. R. Rathod marked historical HOD; profile preserved as Assistant Professor"
            }
        ],
        "vector_store_validation": vdb_result["validation"],
    }

    report_path = REPORTS_DIR / "ingestion_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(ingestion_report, f, indent=2)
    print(f"Saved Ingestion Report to: {report_path}")

    # Extraction Review Report
    review_report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "screenshot_directory_status": screenshot_report,
        "pdf_extraction_status": pdf_report,
        "target_url_audit": [
            {
                "url": l["target_url"],
                "status": "accessible" if l["status_code"] == 200 else "failed",
                "status_code": l["status_code"],
                "final_url": l["final_url"],
                "size_bytes": l["size_bytes"]
            }
            for l in crawl_logs
        ]
    }
    review_path = REPORTS_DIR / "extraction_review_report.json"
    with open(review_path, "w", encoding="utf-8") as f:
        json.dump(review_report, f, indent=2)
    print(f"Saved Extraction Review Report to: {review_path}")

    print("\n" + "=" * 70)
    print(" INGESTION PIPELINE FINISHED SUCCESSFULLY")
    print(f" Indexed {vdb_result['chunks_indexed']} chunks across {len(processed_docs)} documents.")
    print("=" * 70)

if __name__ == "__main__":
    run_pipeline()
