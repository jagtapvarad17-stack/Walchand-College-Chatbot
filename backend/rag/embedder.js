/**
 * ==============================================================================
 * WCE RAG Pipeline — Embedder
 * ==============================================================================
 * Generates dense vector embeddings for text chunks using a local model via
 * @xenova/transformers (already installed). Runs fully offline — no API key
 * required.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 *   - 384-dimensional embeddings
 *   - Optimised for semantic similarity / retrieval tasks
 *   - ~22 MB download, cached automatically in .cache/
 *
 * Usage:
 *   const { embed, embedBatch } = require('./embedder');
 *   const vec = await embed('What are the admission requirements?');
 * ==============================================================================
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Model Configuration
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM   = 384;

// Batch size for processing many chunks at once (avoids OOM on small machines)
const BATCH_SIZE = 32;

// ---------------------------------------------------------------------------
// Lazy-loaded pipeline (singleton)
// ---------------------------------------------------------------------------

let _pipeline = null;

/**
 * Load (or return cached) the feature-extraction pipeline.
 * Downloads model weights on first call, then serves from local cache.
 *
 * @returns {Promise<Function>} The HuggingFace pipeline function
 */
async function getPipeline() {
  if (_pipeline) return _pipeline;

  console.log(`[Embedder] Loading model: ${EMBEDDING_MODEL} …`);

  // Dynamic import because @xenova/transformers is an ESM-first package.
  // We use the CommonJS-compatible interop via require().
  const { pipeline, env } = await import('@xenova/transformers');

  // Store models locally next to the backend to avoid re-downloads
  env.cacheDir = path.resolve(__dirname, '..', '.cache', 'transformers');
  env.allowRemoteModels = true;

  _pipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true,   // use quantized ONNX for smaller size & faster inference
  });

  console.log('[Embedder] Model loaded successfully.');
  return _pipeline;
}

// ---------------------------------------------------------------------------
// Core embedding functions
// ---------------------------------------------------------------------------

/**
 * Embed a single text string.
 *
 * @param {string} text
 * @returns {Promise<number[]>} Normalised embedding vector of length EMBEDDING_DIM
 */
async function embed(text) {
  const extractor = await getPipeline();

  // mean pooling + L2 normalisation (standard for sentence-transformers)
  const output = await extractor(text, { pooling: 'mean', normalize: true });

  // output.data is a Float32Array; convert to plain Array for JSON serialisability
  return Array.from(output.data);
}

/**
 * Embed an array of texts in batches.
 *
 * @param {string[]} texts
 * @param {object}   [options]
 * @param {number}   [options.batchSize=32]
 * @param {Function} [options.onProgress] - Called with (done, total) after each batch
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts, options = {}) {
  const batchSize  = options.batchSize  ?? BATCH_SIZE;
  const onProgress = options.onProgress ?? null;

  const extractor = await getPipeline();
  const results   = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    // Process each text individually (Xenova pipeline handles one at a time)
    for (const text of batch) {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data));
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two normalised embedding vectors.
 * (Both vectors should already be L2-normalised for dot-product = cosine sim.)
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity score in [-1, 1]; higher = more similar
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // already normalised → dot product == cosine similarity
}

module.exports = {
  embed,
  embedBatch,
  cosineSimilarity,
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
};
