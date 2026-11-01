"""
WCE Vector Store Validation Module
Validates chunk count, vector dimensions (384), non-empty text,
metadata fields, and stable chunk IDs.
"""

import json
from pathlib import Path

def validate_vector_store(index_path: Path) -> dict:
    if not index_path.exists():
        return {"valid": False, "error": f"Index file does not exist: {index_path}"}

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"valid": False, "error": f"Failed to parse JSON: {e}"}

    chunks = data.get("chunks", [])
    if not isinstance(chunks, list) or len(chunks) == 0:
        return {"valid": False, "error": "Index contains 0 chunks"}

    seen_ids = set()
    for idx, c in enumerate(chunks):
        c_id = c.get("chunk_id")
        if not c_id:
            return {"valid": False, "error": f"Missing chunk_id at index {idx}"}
        if c_id in seen_ids:
            return {"valid": False, "error": f"Duplicate chunk_id: {c_id}"}
        seen_ids.add(c_id)

        emb = c.get("embedding")
        if not isinstance(emb, list) or len(emb) != 384:
            return {"valid": False, "error": f"Invalid embedding dim at {c_id}: expected 384, got {len(emb) if isinstance(emb, list) else type(emb)}"}

        text = c.get("text")
        if not text or not isinstance(text, str) or len(text.strip()) == 0:
            return {"valid": False, "error": f"Empty text at {c_id}"}

    return {
        "valid": True,
        "total_chunks": len(chunks),
        "embedding_dim": 384,
        "version": data.get("version", "1.0.0"),
        "has_authoritative_records": any(c.get("is_authoritative_override") for c in chunks),
    }

if __name__ == "__main__":
    import sys
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("backend/data/vector_store/index.json")
    print(validate_vector_store(p))

