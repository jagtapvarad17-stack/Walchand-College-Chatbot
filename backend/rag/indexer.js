/**
 * ==============================================================================
 * WCE RAG Pipeline — Index Builder
 * ==============================================================================
 * Orchestrates the full pipeline:
 *   1. Read processed documents from data/processed/wce_documents.jsonl
 *   2. Chunk each document using the configured chunking parameters
 *   3. Embed each chunk with the local embedding model
 *   4. Store the chunks + embeddings in the vector store
 *   5. Persist the index to disk
 *
 * Run with:
 *   node backend/rag/indexer.js
 *   node backend/rag/indexer.js --force   (re-index even if index already exists)
 *
 * Progress is logged to stdout. The script exits with code 0 on success and
 * code 1 on failure.
 * ==============================================================================
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const { chunkDocuments } = require('./chunker');
const { embedBatch }     = require('./embedder');
const vectorStore        = require('./vectorStore');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const JSONL_PATH = path.resolve(__dirname, '..', 'data', 'processed', 'wce_documents.jsonl');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL file into an array of objects.
 *
 * @param {string} filePath
 * @returns {Promise<object[]>}
 */
async function readJsonl(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const rl = readline.createInterface({
      input:     fs.createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    });

    rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        records.push(JSON.parse(trimmed));
      } catch (err) {
        console.warn(`[Indexer] Skipping malformed JSON line: ${trimmed.slice(0, 80)}…`);
      }
    });

    rl.on('close', () => resolve(records));
    rl.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function buildIndex(options = {}) {
  const force = options.force ?? process.argv.includes('--force');

  console.log('='.repeat(60));
  console.log(' WCE RAG Index Builder');
  console.log('='.repeat(60));

  // 1. Check if index already exists (and skip unless --force)
  if (!force && vectorStore.indexExists()) {
    const stats = vectorStore.getStats();
    console.log(`[Indexer] Index already exists with ${stats.totalChunks} chunks.`);
    console.log('[Indexer] Pass --force to rebuild. Exiting.');
    return { skipped: true, totalChunks: stats.totalChunks };
  }

  // 2. Read JSONL
  console.log(`[Indexer] Reading documents from: ${JSONL_PATH}`);
  if (!fs.existsSync(JSONL_PATH)) {
    throw new Error(`[Indexer] JSONL file not found: ${JSONL_PATH}. Run "npm run ingest" first.`);
  }

  const documents = await readJsonl(JSONL_PATH);
  console.log(`[Indexer] Loaded ${documents.length} documents.`);

  // 3. Chunk
  console.log('[Indexer] Chunking documents …');
  const chunks = chunkDocuments(documents, {
    chunkTokens:   600,
    overlapTokens: 100,
  });
  console.log(`[Indexer] Generated ${chunks.length} chunks from ${documents.length} documents.`);

  if (chunks.length === 0) {
    throw new Error('[Indexer] No chunks generated — check extracted_text fields in JSONL.');
  }

  // 4. Embed
  console.log('[Indexer] Embedding chunks (this may take a few minutes on first run to download the model) …');
  const texts = chunks.map(c => c.text);

  const embeddings = await embedBatch(texts, {
    batchSize: 32,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(1);
      process.stdout.write(`\r[Indexer] Embedded ${done}/${total} chunks (${pct}%)   `);
    },
  });
  console.log('\n[Indexer] All chunks embedded.');

  // 5. Combine chunks with their embeddings
  const indexedChunks = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  // 6. Save to vector store
  console.log('[Indexer] Writing to vector store …');
  vectorStore.clearStore();
  const added = vectorStore.addChunks(indexedChunks);
  vectorStore.saveStore();

  const stats = vectorStore.getStats();
  console.log('='.repeat(60));
  console.log(` Index build complete!`);
  console.log(`   Documents processed : ${documents.length}`);
  console.log(`   Chunks generated    : ${chunks.length}`);
  console.log(`   Chunks indexed      : ${added}`);
  console.log(`   Index file          : ${stats.indexFile}`);
  console.log('='.repeat(60));

  return { success: true, documents: documents.length, chunks: chunks.length };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  buildIndex()
    .then(result => {
      if (result.skipped) process.exit(0);
      console.log('[Indexer] Done.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Indexer] Fatal error:', err.message || err);
      process.exit(1);
    });
}

module.exports = { buildIndex };
