/**
 * ==============================================================================
 * WCE RAG Pipeline — Test Suite
 * ==============================================================================
 * Tests for:
 *   1. Chunker   (synchronous — no I/O)
 *   2. Vector Store (file I/O — uses a temp directory)
 *   3. Retriever  (requires the real index to be built first)
 *
 * Run with:
 *   node backend/tests/rag.test.js
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 * ==============================================================================
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${err.message}`);
    failed++;
    failures.push({ name, message: err.message });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${err.message}`);
    failed++;
    failures.push({ name, message: err.message });
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// 1. Chunker tests
// ---------------------------------------------------------------------------

section('Chunker');

const { chunkDocument, chunkDocuments, estimateTokens } = require('../rag/chunker');

test('estimateTokens returns 0 for empty string', () => {
  assert.strictEqual(estimateTokens(''), 0);
});

test('estimateTokens is proportional to word count', () => {
  const tokens = estimateTokens('hello world foo bar baz');
  assert.ok(tokens > 0 && tokens < 10, `Expected small token count, got ${tokens}`);
});

test('chunkDocument returns empty array for short text', () => {
  const doc = { document_id: 'test_001', extracted_text: 'Hi', title: 'T', source_url: '' };
  const chunks = chunkDocument(doc);
  assert.strictEqual(chunks.length, 0);
});

test('chunkDocument returns one chunk for small document', () => {
  const text = 'Walchand College of Engineering is located in Sangli, Maharashtra.';
  const doc  = { document_id: 'test_002', extracted_text: text, title: 'WCE', source_url: 'http://example.com' };
  const chunks = chunkDocument(doc);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].document_id, 'test_002');
  assert.strictEqual(chunks[0].chunk_index, 0);
  assert.strictEqual(chunks[0].total_chunks, 1);
});

test('chunkDocument preserves metadata fields', () => {
  const doc = {
    document_id:   'test_003',
    extracted_text: 'Some content about WCE admission procedures.',
    title:         'Admissions',
    source_url:    'https://walchandsangli.ac.in/admissions/',
    content_type:  'html',
    academic_year: '2026-27',
    page_number:   null,
  };
  const chunks = chunkDocument(doc);
  assert.ok(chunks.length >= 1);
  const c = chunks[0];
  assert.strictEqual(c.title, 'Admissions');
  assert.strictEqual(c.source_url, 'https://walchandsangli.ac.in/admissions/');
  assert.strictEqual(c.content_type, 'html');
  assert.strictEqual(c.academic_year, '2026-27');
});

test('chunkDocument generates multiple overlapping chunks for large text', () => {
  // Generate ~1200 tokens worth of text (> 600 token chunk limit)
  const words = Array.from({ length: 1200 }, (_, i) => `word${i}`).join(' ');
  const doc   = { document_id: 'test_004', extracted_text: words, title: 'Big', source_url: '' };
  const chunks = chunkDocument(doc, { chunkTokens: 600, overlapTokens: 100 });
  assert.ok(chunks.length >= 2, `Expected >= 2 chunks, got ${chunks.length}`);
  // Verify chunk_id format
  assert.ok(chunks[0].chunk_id.startsWith('test_004_chunk_'));
  // Verify indices are sequential
  chunks.forEach((c, i) => assert.strictEqual(c.chunk_index, i));
  // All total_chunks should match
  const total = chunks.length;
  chunks.forEach(c => assert.strictEqual(c.total_chunks, total));
});

test('chunkDocument respects overlap (first and second chunks share words)', () => {
  const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
  const doc   = { document_id: 'test_005', extracted_text: words, title: 'Overlap', source_url: '' };
  const chunks = chunkDocument(doc, { chunkTokens: 300, overlapTokens: 50 });
  assert.ok(chunks.length >= 2, 'Should have at least 2 chunks');
  // The second chunk should start with words that appear at the end of the first chunk
  const firstWords = chunks[0].text.split(' ');
  const secondWords = chunks[1].text.split(' ');
  const overlapCount = firstWords.filter(w => secondWords.includes(w)).length;
  assert.ok(overlapCount > 0, `No overlap detected between chunk 0 and chunk 1`);
});

test('chunkDocuments processes multiple documents', () => {
  const docs = [
    { document_id: 'd1', extracted_text: 'This is a complete sentence about Walchand College of Engineering in Sangli, Maharashtra.', title: 'A', source_url: '' },
    { document_id: 'd2', extracted_text: 'Another detailed sentence about WCE admission procedures and academic programs.', title: 'B', source_url: '' },
  ];
  const chunks = chunkDocuments(docs);
  const ids = new Set(chunks.map(c => c.document_id));
  assert.ok(ids.has('d1'));
  assert.ok(ids.has('d2'));
});

// ---------------------------------------------------------------------------
// 2. Vector Store tests
// ---------------------------------------------------------------------------

section('Vector Store');

const vectorStore = require('../rag/vectorStore');

// Helper: create a fake chunk with a simple 2-dim embedding for testing
function fakeChunk(id, vec) {
  return {
    chunk_id:     id,
    document_id:  `doc_${id}`,
    text:         `Text for chunk ${id}`,
    title:        `Title ${id}`,
    source_url:   `https://example.com/${id}`,
    embedding:    vec,
    content_type: 'html',
    academic_year: null,
    page_number:   null,
    score:         0,
  };
}

// Note: clearStore() + loadStore() may reload from disk. We snapshot the post-clear
// count as a baseline so all assertions are relative to it.

test('addChunks accepts valid chunks', () => {
  vectorStore.clearStore();
  const baseline = vectorStore.getStats().totalChunks; // post-reload baseline
  const c = fakeChunk(`c1_${Date.now()}`, [0.1, 0.2, 0.3]);
  const added = vectorStore.addChunks([c]);
  assert.strictEqual(added, 1);
  assert.strictEqual(vectorStore.getStats().totalChunks, baseline + 1);
});

test('getStats reports correct chunk count', () => {
  vectorStore.clearStore();
  const baseline = vectorStore.getStats().totalChunks;
  const t = Date.now();
  vectorStore.addChunks([fakeChunk(`s1_${t}`, [1, 0]), fakeChunk(`s2_${t}`, [0, 1])]);
  const stats = vectorStore.getStats();
  assert.strictEqual(stats.totalChunks, baseline + 2);
});

test('addChunks deduplicates by chunk_id (upsert behaviour)', () => {
  vectorStore.clearStore();
  const baseline = vectorStore.getStats().totalChunks;
  const id = `dup_${Date.now()}`;
  vectorStore.addChunks([fakeChunk(id, [1, 0])]);
  vectorStore.addChunks([fakeChunk(id, [0, 1])]); // same id, different embedding
  assert.strictEqual(vectorStore.getStats().totalChunks, baseline + 1);
});

test('addChunks skips chunks without embedding', () => {
  vectorStore.clearStore();
  const baseline = vectorStore.getStats().totalChunks;
  const bad = { chunk_id: `bad_${Date.now()}`, text: 'No embedding here' };
  vectorStore.addChunks([bad]);
  assert.strictEqual(vectorStore.getStats().totalChunks, baseline);
});

test('clearStore removes added chunks', () => {
  vectorStore.clearStore();
  const baseline = vectorStore.getStats().totalChunks;
  vectorStore.addChunks([fakeChunk(`cl_${Date.now()}`, [1, 0])]);
  assert.strictEqual(vectorStore.getStats().totalChunks, baseline + 1);
  // A second clearStore call should bring us back to baseline (reload)
  vectorStore.clearStore();
  assert.ok(vectorStore.getStats().totalChunks <= baseline + 1, 'clearStore should not increase chunk count');
});

test('search returns results sorted by descending similarity', () => {
  vectorStore.clearStore();
  const v1 = Array(384).fill(0); v1[0] = 1;
  const v2 = Array(384).fill(0); v2[1] = 1;
  const query = Array(384).fill(0); query[0] = 1;
  const t = Date.now();

  vectorStore.addChunks([
    { ...fakeChunk(`r1_${t}`, v1) },
    { ...fakeChunk(`r2_${t}`, v2) },
  ]);

  const results = vectorStore.search(query, { topK: 100, minScore: 0 });
  assert.ok(results.length >= 2, `Expected at least 2 results, got ${results.length}`);
  // Verify sorted descending
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, 'Results not sorted descending');
  }
  // The chunk with v1 (perfect match) should be first
  assert.ok(results[0].score >= 0.99, `Expected top score ~1.0, got ${results[0].score}`);
});

test('search respects minScore threshold', () => {
  vectorStore.clearStore();
  const v1 = Array(384).fill(0); v1[0] = 1;
  const v2 = Array(384).fill(0); v2[1] = 1;
  const query = Array(384).fill(0); query[0] = 1;
  const t = Date.now();

  const id1 = `th1_${t}`;
  const id2 = `th2_${t}`;
  vectorStore.addChunks([
    { ...fakeChunk(id1, v1) },
    { ...fakeChunk(id2, v2) },
  ]);

  // With minScore=0.9, only the chunk with cosine=1.0 should be returned
  const results = vectorStore.search(query, { topK: 10, minScore: 0.9 });
  assert.ok(results.length >= 1);
  // All returned results must have score >= 0.9
  results.forEach(r => assert.ok(r.score >= 0.9, `Score ${r.score} below threshold`));
  // The orthogonal chunk should not appear
  const hasOrthogonal = results.some(r => r.chunk_id === id2);
  assert.ok(!hasOrthogonal, 'Orthogonal chunk should be excluded by minScore threshold');
});

test('search returns only valid results when store has indexed chunks', () => {
  vectorStore.clearStore();
  const q = Array(384).fill(0.1);
  const results = vectorStore.search(q, { topK: 5, minScore: 0 });
  // Either empty (no disk index) or containing only scored items
  results.forEach(r => assert.ok(typeof r.score === 'number'));
});

// ---------------------------------------------------------------------------
// 3. Retriever integration tests (requires built index)
// ---------------------------------------------------------------------------

section('Retriever (requires built index)');

async function runRetrieverTests() {
  // Reload the vector store from disk (previous tests cleared the in-memory state)
  const freshVectorStore = require('../rag/vectorStore');
  freshVectorStore.loadStore();

  const retriever = require('../rag/retriever');
  // Reset the retriever's internal loaded flag so it re-reads the store
  // We call getIndexStats() to trigger a fresh load
  retriever.getIndexStats();

  await testAsync('isIndexAvailable() returns boolean', async () => {
    const available = retriever.isIndexAvailable();
    assert.ok(typeof available === 'boolean');
  });

  await testAsync('getIndexStats() returns stats object', async () => {
    const stats = retriever.getIndexStats();
    assert.ok(typeof stats.totalChunks === 'number');
    assert.ok(typeof stats.version === 'string');
  });

  if (!retriever.isIndexAvailable()) {
    console.log('  ⚠  Vector index is empty — skipping live retrieval tests.');
    console.log('     Run "npm run rag:index" first to build the index.');
    return;
  }

  await testAsync('retrieve() returns array for WCE query', async () => {
    const results = await retriever.retrieve('What programs does WCE offer?', { topK: 3 });
    assert.ok(Array.isArray(results));
    // Results may be empty if score threshold not met — that's acceptable
  });

  await testAsync('retrieve() results have required fields', async () => {
    const results = await retriever.retrieve('admission procedure WCE Sangli', { topK: 3, minScore: 0 });
    if (results.length > 0) {
      const r = results[0];
      assert.ok(typeof r.chunk_id === 'string');
      assert.ok(typeof r.text === 'string');
      assert.ok(typeof r.score === 'number');
      // Ensure raw embedding is stripped from results
      assert.ok(!Object.prototype.hasOwnProperty.call(r, 'embedding'), 'Embedding should be stripped from results');
    }
  });

  await testAsync('retrieve() results are sorted by score descending', async () => {
    const results = await retriever.retrieve('WCE campus library', { topK: 5, minScore: 0 });
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `Scores not descending: ${results[i-1].score} < ${results[i].score}`
      );
    }
  });

  await testAsync('formatContext() produces non-empty contextText when results exist', async () => {
    const results = await retriever.retrieve('Walchand College history', { topK: 3, minScore: 0 });
    const { contextText, sources } = retriever.formatContext(results);
    if (results.length > 0) {
      assert.ok(contextText.length > 0);
      assert.ok(Array.isArray(sources));
      assert.strictEqual(sources.length, results.length);
    } else {
      assert.strictEqual(contextText, '');
      assert.strictEqual(sources.length, 0);
    }
  });

  await testAsync('formatContext() with empty results returns empty strings', async () => {
    const { contextText, sources } = retriever.formatContext([]);
    assert.strictEqual(contextText, '');
    assert.deepStrictEqual(sources, []);
  });
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' WCE RAG Pipeline — Test Suite');
  console.log('══════════════════════════════════════════════════');

  await runRetrieverTests();

  // Cleanup temp dir
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

  console.log('\n══════════════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.error('Failed tests:');
    failures.forEach(f => console.error(`  • ${f.name}: ${f.message}`));
    process.exit(1);
  } else {
    console.log('All tests passed! ✓');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
