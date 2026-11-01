"""
WCE Vector Store Builder
Builds the vector store atomically in a temporary location, runs full validation,
backs up the previous active index, and replaces it with the validated index.
"""

import os
import shutil
import json
from datetime import datetime
from pathlib import Path
from .validate_index import validate_vector_store

STORE_DIR = Path(__file__).resolve().parent.parent.parent / "backend" / "data" / "vector_store"
INDEX_FILE = STORE_DIR / "index.json"
BACKUP_FILE = STORE_DIR / "index.backup.json"
TMP_INDEX_FILE = STORE_DIR / "index.json.tmp"

def build_vector_store(embedded_chunks: list) -> dict:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    payload = {
        "version": "1.0.0",
        "created_at": timestamp,
        "updated_at": timestamp,
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "embedding_dim": 384,
        "chunks": embedded_chunks,
    }

    # 1. Write to temporary file
    with open(TMP_INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # 2. Validate temporary file
    val_result = validate_vector_store(TMP_INDEX_FILE)
    if not val_result.get("valid"):
        TMP_INDEX_FILE.unlink(missing_ok=True)
        raise ValueError(f"Vector store validation failed: {val_result.get('error')}")

    # 3. Backup previous index if it exists
    if INDEX_FILE.exists():
        shutil.copy2(INDEX_FILE, BACKUP_FILE)
        print(f"[VectorStore] Backed up previous index to {BACKUP_FILE}")

    # 4. Atomic rename
    shutil.move(str(TMP_INDEX_FILE), str(INDEX_FILE))
    print(f"[VectorStore] Successfully installed new index with {len(embedded_chunks)} chunks at {INDEX_FILE}")

    return {
        "status": "success",
        "chunks_indexed": len(embedded_chunks),
        "index_path": str(INDEX_FILE),
        "backup_path": str(BACKUP_FILE),
        "validation": val_result,
    }

if __name__ == "__main__":
    print("Run via ingestion pipeline.")

