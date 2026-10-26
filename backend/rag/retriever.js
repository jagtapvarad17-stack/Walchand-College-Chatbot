/**
 * ==============================================================================
 * WCE RAG Pipeline — Retriever
 * ==============================================================================
 * Provides a high-level interface to retrieve the most relevant document chunks
 * for a given user query. Used directly by the chat endpoint in index.js.
 *
 * Responsibilities:
 *   1. Embed the incoming query with the same model used during indexing
 *   2. Search the vector store for the top-K most similar chunks
 *   3. Format results into source citations for the frontend
 *
 * The retriever performs lazy index loading — the vector store is read from
 * disk on the first call and cached in memory for all subsequent requests.
 * ==============================================================================
 */

'use strict';

const { embed }      = require('./embedder');
const vectorStore    = require('./vectorStore');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K     = 5;
const DEFAULT_MIN_SCORE = 0.30;  // raise threshold to reduce hallucination risk

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Ensure the vector store is loaded from disk (idempotent).
 * @private
 */
function ensureStoreLoaded() {
  // Always call loadStore() — it is idempotent (returns cached store if already
  // loaded). This avoids false negatives when test code calls clearStore() on
  // the shared module singleton.
  vectorStore.loadStore();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the most relevant chunks for a user query.
 *
 * @param {string} query   - The user's question
 * @param {object} [opts]
 * @param {number} [opts.topK=5]          - Max chunks to return
 * @param {number} [opts.minScore=0.30]   - Minimum cosine similarity score
 * @returns {Promise<RetrievalResult[]>}
 *
 * @typedef {object} RetrievalResult
 * @property {string}      chunk_id
 * @property {string}      document_id
 * @property {string}      text           - The chunk text to inject into the LLM context
 * @property {string}      title          - Document title
 * @property {string}      source_url     - Source URL
 * @property {string|null} content_type   - 'html' | 'pdf' | 'unknown'
 * @property {string|null} academic_year
 * @property {number|null} page_number
 * @property {number}      score          - Cosine similarity score
 */
async function retrieve(query, opts = {}) {
  const topK     = opts.topK     ?? DEFAULT_TOP_K;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;

  ensureStoreLoaded();

  const stats = vectorStore.getStats();
  if (stats.totalChunks === 0) {
    // Vector store is empty — RAG is not available
    return [];
  }

  // 1. Embed the query using the same model as the index
  const queryEmbedding = await embed(query);

  // 2. Search the vector store
  const hits = vectorStore.search(queryEmbedding, { topK, minScore });

  // 3. Strip the raw embedding from results (not needed downstream)
  return hits.map(({ embedding: _e, ...rest }) => rest);
}

/**
 * Check whether the RAG index is available and non-empty.
 *
 * @returns {boolean}
 */
function isIndexAvailable() {
  ensureStoreLoaded();
  return vectorStore.getStats().totalChunks > 0;
}

/**
 * Get index statistics (for health endpoint).
 *
 * @returns {{ totalChunks: number, version: string, updated_at: string }}
 */
function getIndexStats() {
  ensureStoreLoaded();
  return vectorStore.getStats();
}

/**
 * Format retrieval results into the context string injected into the LLM prompt
 * and the sources array returned to the frontend.
 *
 * @param {RetrievalResult[]} results
 * @returns {{ contextText: string, sources: object[] }}
 */
function formatContext(results) {
  if (!results || results.length === 0) {
    return { contextText: '', sources: [] };
  }

  const contextParts = results.map((r, i) => {
    const meta = [
      r.title       ? `Title: ${r.title}`            : null,
      r.source_url  ? `Source: ${r.source_url}`       : null,
      r.page_number ? `Page: ${r.page_number}`        : null,
    ].filter(Boolean).join(' | ');

    return `[Context ${i + 1}] ${meta}\n${r.text}`;
  });

  const contextText = contextParts.join('\n\n---\n\n');

  const sources = results.map((r, i) => ({
    id:      `src-${i}`,
    title:   r.title    || `WCE Document ${i + 1}`,
    url:     r.source_url || null,
    page:    r.page_number || null,
    snippet: r.text ? r.text.slice(0, 300) + (r.text.length > 300 ? '…' : '') : null,
    score:   Math.round(r.score * 100) / 100,
  }));

  return { contextText, sources };
}

module.exports = {
  retrieve,
  isIndexAvailable,
  getIndexStats,
  formatContext,
};
