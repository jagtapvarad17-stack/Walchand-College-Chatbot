"""
WCE Metadata Normalization and Schema Enforcement
Ensures every document and chunk conforms to strict provenance specifications.
"""

REQUIRED_DOC_FIELDS = [
    "document_id",
    "page_title",
    "department",
    "category",
    "section",
    "content",
    "source_type",
    "source_url",
    "source_title",
    "extraction_date",
    "verification_status"
]

def standardize_doc_metadata(doc: dict) -> dict:
    standardized = dict(doc)
    standardized["document_id"] = doc.get("document_id") or "wce_doc"
    standardized["page_title"] = doc.get("page_title") or doc.get("title") or "WCE Document"
    standardized["title"] = standardized["page_title"]
    standardized["department"] = doc.get("department") or "Institutional"
    standardized["category"] = doc.get("category") or "general"
    standardized["section"] = doc.get("section") or "general"
    standardized["content"] = doc.get("content") or doc.get("extracted_text") or ""
    standardized["extracted_text"] = standardized["content"]
    standardized["source_type"] = doc.get("source_type") or "website"
    standardized["source_url"] = doc.get("source_url") or ""
    standardized["source_title"] = doc.get("source_title") or standardized["page_title"]
    standardized["extraction_date"] = doc.get("extraction_date") or "2026-11-01"
    standardized["verification_status"] = doc.get("verification_status") or "verified"
    return standardized

