"""
WCE Embedding Generation Module
Generates 384-dimensional dense vectors for document chunks using
sentence-transformers/all-MiniLM-L6-v2.
"""

import sys
import json
import subprocess
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
BATCH_EMBED_SCRIPT = BACKEND_DIR / "rag" / "batchEmbed.js"

def generate_embeddings_for_chunks(chunks: list) -> list:
    if not chunks:
        return []

    print(f"Generating embeddings for {len(chunks)} chunks using all-MiniLM-L6-v2 (384-dim)...")
    
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f_in:
        json.dump(chunks, f_in)
        temp_in = f_in.name

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f_out:
        temp_out = f_out.name

    try:
        # Run node batch embedder
        cmd = ["node", str(BATCH_EMBED_SCRIPT), temp_in, temp_out]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(res.stdout)
        
        with open(temp_out, "r", encoding="utf-8") as f:
            embedded_chunks = json.load(f)

        # Validate vector count and dimensions
        assert len(embedded_chunks) == len(chunks), "Mismatch in embedded chunk count"
        for idx, c in enumerate(embedded_chunks):
            emb = c.get("embedding")
            assert isinstance(emb, list) and len(emb) == 384, f"Invalid embedding at chunk {idx}: dim {len(emb) if isinstance(emb, list) else 'non-list'}"

        print(f"Validated all {len(embedded_chunks)} chunks: 384 dimensions.")
        return embedded_chunks
    finally:
        try:
            Path(temp_in).unlink(missing_ok=True)
            Path(temp_out).unlink(missing_ok=True)
        except Exception:
            pass

if __name__ == "__main__":
    sample = [{"chunk_id": "test_1", "text": "Walchand College of Engineering Sangli"}]
    res = generate_embeddings_for_chunks(sample)
    print("Success. Embedding length:", len(res[0]["embedding"]))

