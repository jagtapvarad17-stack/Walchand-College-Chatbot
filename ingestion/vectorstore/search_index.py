"""
WCE Vector Store Search Module (Python)
Performs cosine similarity search with department and category filtering.
"""

import math
import json
from pathlib import Path

STORE_DIR = Path(__file__).resolve().parent.parent.parent / "backend" / "data" / "vector_store"
INDEX_FILE = STORE_DIR / "index.json"

def cosine_similarity(v1: list, v2: list) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    return dot  # vectors are already L2-normalized

def search_index(query_vector: list, top_k: int = 5, department: str = None, category: str = None) -> list:
    if not INDEX_FILE.exists():
        return []

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    chunks = data.get("chunks", [])
    results = []

    for c in chunks:
        if department and c.get("department") != department:
            continue
        if category and c.get("category") != category:
            continue

        emb = c.get("embedding")
        if not emb or len(emb) != len(query_vector):
            continue

        score = cosine_similarity(query_vector, emb)
        results.append({
            "chunk_id": c.get("chunk_id"),
            "document_id": c.get("document_id"),
            "text": c.get("text"),
            "title": c.get("title"),
            "department": c.get("department"),
            "category": c.get("category"),
            "source_url": c.get("source_url"),
            "is_authoritative_override": c.get("is_authoritative_override", False),
            "score": round(score, 4),
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]

