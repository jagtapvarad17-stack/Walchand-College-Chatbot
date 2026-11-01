/**
 * Batch Embedding Utility for Ingestion Pipeline
 * Reads array of chunks from JSON file, embeds them in batches of 32 using
 * Xenova/all-MiniLM-L6-v2 (384-dim), and writes updated chunks with embeddings.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { embedBatch } = require('./embedder');

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || inputPath;

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('Usage: node batchEmbed.js <input.json> [output.json]');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const chunks = JSON.parse(raw);
  console.log(`[BatchEmbed] Embedding ${chunks.length} chunks using Xenova/all-MiniLM-L6-v2 (384-dim)...`);

  const texts = chunks.map(c => c.text);
  const embeddings = await embedBatch(texts, {
    batchSize: 32,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(1);
      process.stdout.write(`\r[BatchEmbed] Progress: ${done}/${total} chunks (${pct}%) `);
    }
  });

  console.log('\n[BatchEmbed] Embedding completed successfully.');

  const resultChunks = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }));

  fs.writeFileSync(outputPath, JSON.stringify(resultChunks, null, 2), 'utf8');
  console.log(`[BatchEmbed] Saved ${resultChunks.length} embedded chunks to ${outputPath}`);
}

main().catch(err => {
  console.error('[BatchEmbed] Fatal error:', err);
  process.exit(1);
});

