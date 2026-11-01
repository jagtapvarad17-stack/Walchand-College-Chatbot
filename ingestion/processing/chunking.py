"""
WCE Chunking Implementation
Splits documents into coherent semantic chunks (~500 tokens, ~80 overlap)
while preserving table headers, faculty records, curriculum tracks,
and source attribution metadata.
"""

import math
import re

WORDS_PER_TOKEN = 0.75

def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    words = len(text.strip().split())
    return math.ceil(words / WORDS_PER_TOKEN)

def build_chunk(doc: dict, chunk_text: str, chunk_idx: int, total_chunks: int = 1) -> dict:
    doc_id = doc.get("document_id", "wce_doc")
    return {
        "chunk_id": f"{doc_id}_chunk_{chunk_idx}",
        "document_id": doc_id,
        "chunk_index": chunk_idx,
        "total_chunks": total_chunks,
        "text": chunk_text.strip(),
        "token_estimate": estimate_tokens(chunk_text),
        "title": doc.get("page_title") or doc.get("title", ""),
        "page_title": doc.get("page_title") or doc.get("title", ""),
        "department": doc.get("department", "Institutional"),
        "category": doc.get("category", "general"),
        "section": doc.get("section", ""),
        "source_type": doc.get("source_type", "website"),
        "source_url": doc.get("source_url", ""),
        "source_title": doc.get("source_title", doc.get("title", "")),
        "extraction_date": doc.get("extraction_date", "2026-11-01"),
        "verification_status": doc.get("verification_status", "verified"),
        "is_authoritative_override": doc.get("is_authoritative_override", False),
    }

def chunk_document(doc: dict, chunk_tokens: int = 500, overlap_tokens: int = 80) -> list:
    content = (doc.get("content") or doc.get("extracted_text") or "").strip()
    if not content or len(content) < 30:
        return []

    # If it is an authoritative override or short doc, keep it intact in 1 chunk
    if doc.get("is_authoritative_override") or estimate_tokens(content) <= chunk_tokens:
        return [build_chunk(doc, content, 0, 1)]

    # Split by major blocks: tables, sections (###), paragraphs
    # Keep [TABLE]...[/TABLE] blocks atomic whenever possible
    raw_blocks = re.split(r"(\[TABLE\].*?\[/TABLE\])", content, flags=re.DOTALL)
    
    sections = []
    for b in raw_blocks:
        b = b.strip()
        if not b:
            continue
        if b.startswith("[TABLE]") and b.endswith("[/TABLE]"):
            sections.append(b)
        else:
            # Split by double newline or headings
            sub_paragraphs = [p.strip() for p in re.split(r"\n\n+(?=###|\b)", b) if p.strip()]
            sections.extend(sub_paragraphs)

    chunk_words_target = int(chunk_tokens * WORDS_PER_TOKEN)
    overlap_words_target = int(overlap_tokens * WORDS_PER_TOKEN)

    chunks = []
    current_words = []
    
    for sec in sections:
        sec_words = sec.split()
        if len(current_words) + len(sec_words) <= chunk_words_target:
            current_words.extend(sec_words)
        else:
            if current_words:
                chunk_text = " ".join(current_words)
                chunks.append(chunk_text)
                # Keep overlap from the end of current chunk
                current_words = current_words[-overlap_words_target:] if overlap_words_target > 0 else []
            
            # If the single section itself is larger than target, slide over it
            if len(sec_words) > chunk_words_target:
                start = 0
                while start < len(sec_words):
                    end = min(start + chunk_words_target, len(sec_words))
                    slice_words = sec_words[start:end]
                    chunks.append(" ".join(slice_words))
                    if end >= len(sec_words):
                        current_words = sec_words[-overlap_words_target:] if overlap_words_target > 0 else []
                        break
                    start += max(1, chunk_words_target - overlap_words_target)
            else:
                current_words.extend(sec_words)

    if current_words:
        chunks.append(" ".join(current_words))

    # Format into chunk records with total_chunks metadata
    chunk_records = []
    total = len(chunks)
    for i, c_text in enumerate(chunks):
        chunk_records.append(build_chunk(doc, c_text, i, total))

    return chunk_records

def chunk_documents(documents: list, chunk_tokens: int = 500, overlap_tokens: int = 80) -> list:
    all_chunks = []
    for d in documents:
        ch = chunk_document(d, chunk_tokens=chunk_tokens, overlap_tokens=overlap_tokens)
        all_chunks.extend(ch)
    return all_chunks

