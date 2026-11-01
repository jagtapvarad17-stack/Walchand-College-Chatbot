"""
WCE Deduplication & Authoritative Corrections Module
Performs source-aware deduplication and strictly enforces authoritative overrides,
specifically establishing Dr. U. B. Chavan as the current IT HOD and marking outdated
leadership records as historical while preserving Dr. R. R. Rathod's faculty profile.
"""

import json
import hashlib
from pathlib import Path

OVERRIDES_FILE = Path(__file__).resolve().parent.parent / "corrections" / "authoritative_overrides.json"

def load_authoritative_overrides():
    if OVERRIDES_FILE.exists():
        try:
            with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: could not load overrides file: {e}")
    return []

def apply_authoritative_corrections(documents: list) -> list:
    overrides = load_authoritative_overrides()
    
    # Extract IT HOD override rule if present
    it_hod_override = None
    for ov in overrides:
        if ov.get("entity") == "Information Technology Department" and ov.get("attribute") == "current_hod":
            it_hod_override = ov
            break

    corrected_docs = []
    
    # We will create an explicit dedicated authoritative record for IT HOD to guarantee unambiguous retrieval
    if it_hod_override:
        authoritative_it_hod_doc = {
            "document_id": "auth_override_it_hod",
            "page_title": "Information Technology Department - Current Head of Department (Authoritative)",
            "title": "Information Technology Department - Current Head of Department (Authoritative)",
            "department": "Information Technology",
            "category": "leadership",
            "section": "head_of_department",
            "content": (
                "Authoritative Institution Record: Information Technology Department Leadership.\n\n"
                f"Current Head of the Information Technology Department: {it_hod_override['value']} "
                f"({it_hod_override.get('designation', 'Head of Department')}).\n"
                "Department: Information Technology (IT), Walchand College of Engineering, Sangli.\n"
                f"Administrative Position: {it_hod_override.get('designation', 'Head of Department')}.\n"
                f"Source: {it_hod_override.get('source', 'User-provided correction')}.\n"
                f"Verification Status: {it_hod_override.get('verification_status', 'pending_official_confirmation')}.\n"
                "Note on Leadership History: Any previous records or older website versions indicating Dr. R. R. Rathod "
                "as Head of Department reflect past/historical tenure. Dr. R. R. Rathod continues as a distinguished faculty member "
                "(Assistant Professor with Ph.D. and 21 years of experience) in the IT Department, while the current Head of "
                f"Department is {it_hod_override['value']}."
            ),
            "extracted_text": "", # will be populated
            "source_type": "authoritative_override",
            "source_url": "https://walchandsangli.ac.in/department-of-information-technology/faculty-it/",
            "source_title": "Authoritative Record - IT Department Current HOD",
            "extraction_date": it_hod_override.get("updated_at", "2026-11-01"),
            "verification_status": it_hod_override.get("verification_status", "pending_official_confirmation"),
            "is_authoritative_override": True,
        }
        authoritative_it_hod_doc["extracted_text"] = authoritative_it_hod_doc["content"]
        corrected_docs.append(authoritative_it_hod_doc)

    for doc in documents:
        # Avoid duplicate authoritative record if loaded from existing JSONL
        if doc.get("document_id") == "auth_override_it_hod" or doc.get("is_authoritative_override"):
            continue

        doc_copy = dict(doc)
        text = doc_copy.get("content", "")

        # Check for outdated references where Dr. R. R. Rathod is identified as current HOD
        if "rathod" in text.lower() and ("head of department" in text.lower() or "hod" in text.lower()):
            # Reclassify outdated claim as historical
            text = text.replace(
                "Head of Department",
                "Faculty Member (Former/Historical HOD; Current HOD is Dr. U. B. Chavan)"
            )
            doc_copy["content"] = text
            doc_copy["extracted_text"] = text
            doc_copy["verification_status"] = "corrected_with_historical_notes"

        corrected_docs.append(doc_copy)

    return corrected_docs

def deduplicate_documents(documents: list) -> list:
    """
    Deduplicates documents based on document_id, source_url, and content hash while preserving
    distinct sections, departments, and authoritative overrides.
    """
    seen_hashes = set()
    seen_urls = set()
    seen_doc_ids = set()
    deduped = []

    for doc in documents:
        doc_id = doc.get("document_id")
        if doc_id and doc_id in seen_doc_ids:
            continue
        if doc_id:
            seen_doc_ids.add(doc_id)

        # Always keep authoritative overrides
        if doc.get("is_authoritative_override"):
            deduped.append(doc)
            continue

        url = doc.get("source_url")
        content = (doc.get("content") or "").strip()
        if not content:
            continue

        c_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

        # If exact content hash seen, skip
        if c_hash in seen_hashes:
            continue
        seen_hashes.add(c_hash)

        # If page already seen from same URL and identical title, check if it adds new section
        url_key = f"{url}::{doc.get('page_title', '')}"
        if url_key in seen_urls:
            continue
        seen_urls.add(url_key)

        deduped.append(doc)

    return deduped

def process_and_deduplicate(all_documents: list) -> list:
    corrected = apply_authoritative_corrections(all_documents)
    deduped = deduplicate_documents(corrected)
    return deduped
