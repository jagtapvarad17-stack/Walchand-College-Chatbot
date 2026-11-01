"""
WCE Data Cleaning and Normalization Module
Cleans extracted text, normalizes whitespace, formats structured blocks,
and ensures clean content representation for chunking and retrieval.
"""

import re

def clean_text(text: str) -> str:
    if not text or not isinstance(text, str):
        return ""
    
    # Replace non-breaking spaces and zero-width spaces
    text = re.sub(r"[\u00A0\u200B\u200C\u200D\uFEFF]", " ", text)
    # Normalize carriage returns
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Replace unicode replacement character if any
    text = text.replace("\ufffd", "-")
    # Strip trailing whitespace on lines
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    # Collapse multiple spaces
    text = re.sub(r"[ \t]{2,}", " ", text)
    # Collapse 3+ newlines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def clean_document_record(doc: dict) -> dict:
    cleaned = dict(doc)
    cleaned["content"] = clean_text(cleaned.get("content", ""))
    cleaned["extracted_text"] = cleaned["content"]
    cleaned["page_title"] = clean_text(cleaned.get("page_title", ""))
    cleaned["title"] = cleaned["page_title"]
    return cleaned
