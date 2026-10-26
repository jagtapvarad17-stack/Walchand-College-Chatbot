/**
 * ==============================================================================
 * WCE RAG Pipeline — Vector Store
 * ==============================================================================
 * A lightweight, file-backed in-memory vector store for semantic similarity
 * search. Stores chunk metadata + pre-computed embeddings in a JSON file.
 *
 * Design decisions:
 *   • No external vector DB dependency (Pinecone, Weaviate, etc.) — keeps the
 *     project self-contained and offline-capable.
 *   • Full-scan cosine similarity — adequate for a corpus of a few hundred
 *     chunks. Upgrade to HNSW or Faiss when the corpus exceeds ~50 k chunks.
 *   • Atomic file writes (write to .tmp then rename) to prevent corruption.
 *
 * File layout:
 *   data/vector_store/index.json
 *     { version, created_at, updated_at, chunks: [{chunk_id, embedding, ...metadata}] }
 * ==============================================================================
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { cosineSimilarity } = require('./embedder');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const STORE_DIR  = path.resolve(__dirname, '..', 'data', 'vector_store');
const INDEX_FILE = path.join(STORE_DIR, 'index.json');
const TMP_FILE   = INDEX_FILE + '.tmp';

const STORE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** @type {{ version: string, created_at: string, updated_at: string, chunks: object[] } | null} */
let _store = null;

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the store directory exists.
 * @private
 */
function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

/**
 * Load the index from disk into memory. Idempotent — safe to call multiple times.
 *
 * @returns {{ version: string, chunks: object[] }}
 */
function loadStore() {
  ensureDir();

  // If store is already populated, return it
  if (_store && _store.chunks && _store.chunks.length > 0) return _store;

  // If _store exists but is empty AND the file exists, reload from disk.
  // This handles the case where clearStore() was called (e.g., in tests) and
  // loadStore() is called again afterward to repopulate.
  const fileExists = fs.existsSync(INDEX_FILE);

  if (!_store) {
    if (!fileExists) {
      _store = {
        version:    STORE_VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chunks:     [],
      };
      return _store;
    }
  }

  if (fileExists) {
    try {
      const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Only replace if the file has content
      if (parsed.chunks && parsed.chunks.length > 0) {
        _store = parsed;
        console.log(`[VectorStore] Loaded ${_store.chunks.length} chunks from disk.`);
      }
    } catch (err) {
      console.error('[VectorStore] Failed to parse index.json — keeping existing store.', err.message);
    }
  }

  if (!_store) {
    _store = {
      version:    STORE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chunks:     [],
    };
  }

  return _store;
}

/**
 * Persist the current in-memory store to disk using an atomic write.
 */
function saveStore() {
  ensureDir();

  const store = loadStore();
  store.updated_at = new Date().toISOString();

  const serialised = JSON.stringify(store, null, 2);
  fs.writeFileSync(TMP_FILE, serialised, 'utf-8');
  fs.renameSync(TMP_FILE, INDEX_FILE);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clear all chunks from the store (in memory only — call saveStore() to persist).
 */
function clearStore() {
  const store = loadStore();
  store.chunks = [];
}

/**
 * Add an array of chunk objects (each must include an `embedding` field) to the store.
 *
 * @param {object[]} chunks - Each element: { chunk_id, embedding, text, metadata… }
 */
function addChunks(chunks) {
  const store = loadStore();

  // Build a set of existing chunk IDs for deduplication
  const existing = new Set(store.chunks.map(c => c.chunk_id));

  let added = 0;
  for (const chunk of chunks) {
    if (!chunk.chunk_id || !Array.isArray(chunk.embedding)) {
      console.warn('[VectorStore] Skipping chunk without chunk_id or embedding:', chunk.chunk_id);
      continue;
    }
    if (existing.has(chunk.chunk_id)) {
      // Overwrite the existing entry
      const idx = store.chunks.findIndex(c => c.chunk_id === chunk.chunk_id);
      store.chunks[idx] = chunk;
    } else {
      store.chunks.push(chunk);
      existing.add(chunk.chunk_id);
      added++;
    }
  }

  return added;
}

/**
 * Perform a cosine-similarity search against all stored chunks.
 *
 * @param {number[]} queryEmbedding - Query vector (same dimensionality as stored embeddings)
 * @param {object}   [options]
 * @param {number}   [options.topK=5]          - Number of results to return
 * @param {number}   [options.minScore=0.25]   - Minimum similarity threshold
 * @returns {object[]} Top-K chunks sorted by descending similarity, each with a `score` field
 */
function search(queryEmbedding, options = {}) {
  const topK     = options.topK     ?? 5;
  const minScore = options.minScore ?? 0.25;

  const store = loadStore();

  if (store.chunks.length === 0) {
    return [];
  }

  // Score every chunk
  const scored = store.chunks.map(chunk => {
    let score = 0;
    try {
      score = cosineSimilarity(queryEmbedding, chunk.embedding);
    } catch {
      score = -1;
    }
    return { ...chunk, score };
  });

  // Sort descending, filter by threshold, return top-K
  return scored
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Return basic statistics about the current store.
 *
 * @returns {{ totalChunks: number, version: string, updated_at: string }}
 */
function getStats() {
  const store = loadStore();
  return {
    totalChunks: store.chunks.length,
    version:     store.version,
    created_at:  store.created_at,
    updated_at:  store.updated_at,
    indexFile:   INDEX_FILE,
  };
}

/**
 * Check whether the index file exists on disk.
 * @returns {boolean}
 */
function indexExists() {
  return fs.existsSync(INDEX_FILE);
}

module.exports = {
  loadStore,
  saveStore,
  clearStore,
  addChunks,
  search,
  getStats,
  indexExists,
  INDEX_FILE,
};
