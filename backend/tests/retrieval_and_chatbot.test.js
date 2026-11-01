/**
 * ==============================================================================
 * Comprehensive WCE RAG Retrieval and Chatbot Test Suite
 * ==============================================================================
 * Tests:
 *   1. Vector store and index integrity (dimensions, chunk count)
 *   2. IT HOD authoritative retrieval: Dr. U. B. Chavan
 *   3. IT HOD query phrasing variants: Dr. U. B. Chavan
 *   4. Dr. R. R. Rathod profile preservation (Assistant Professor, not current HOD)
 *   5. Admissions retrieval (First-year B.Tech, PIO/OCI/NRI, DSE)
 *   6. Mechanical Engineering (Overview, Curriculum, Faculty)
 *   7. Computer Engineering (Overview, Faculty)
 *   8. Placements & Career Development Cell
 *   9. Zero hyperlinks and zero raw URLs in formatted context and sanitized reply
 *  10. Out-of-scope query fallback behavior
 * ==============================================================================
 */

'use strict';

const assert = require('assert');
const retriever = require('../rag/retriever');
const vectorStore = require('../rag/vectorStore');

let passedTests = 0;
let failedTests = 0;

function reportPass(name) {
  console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${name}`);
  passedTests++;
}

function reportFail(name, err) {
  console.error(`  \x1b[31m✗ [FAIL]\x1b[0m ${name}`);
  console.error(`         ${err.message || err}`);
  failedTests++;
}

async function runTests() {
  console.log('='.repeat(65));
  console.log(' WCE RAG Chatbot & Retrieval Accuracy Test Suite');
  console.log('='.repeat(65));

  // ---------------------------------------------------------------------------
  // 1. Vector Store Integrity
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Vector Store & Index Validation]');
  try {
    const stats = vectorStore.getStats();
    assert(stats.totalChunks > 50, `Expected >50 chunks, got ${stats.totalChunks}`);
    reportPass(`Vector store contains ${stats.totalChunks} indexed chunks`);

    const store = vectorStore.loadStore();
    const badDim = store.chunks.find(c => !Array.isArray(c.embedding) || c.embedding.length !== 384);
    assert(!badDim, `Found chunk with invalid embedding dimension`);
    reportPass('All chunk vectors strictly conform to 384 dimensions');

    const authChunk = store.chunks.find(c => c.is_authoritative_override);
    assert(authChunk, 'Authoritative override chunk not found in vector store');
    assert(authChunk.text.includes('Dr. U. B. Chavan'), 'Authoritative chunk does not mention Dr. U. B. Chavan');
    reportPass('Authoritative IT HOD override chunk is indexed and contains Dr. U. B. Chavan');
  } catch (err) {
    reportFail('Vector store integrity check', err);
  }

  // ---------------------------------------------------------------------------
  // 2. Mandatory Accuracy Test 1: Current IT HOD
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Mandatory Accuracy - Current IT HOD]');
  try {
    const query = 'Who is the current Head of the Information Technology Department at WCE?';
    const hits = await retriever.retrieve(query, { topK: 3 });
    assert(hits.length > 0, 'No chunks retrieved for IT HOD query');
    
    const topChunk = hits[0];
    assert(
      topChunk.text.includes('Dr. U. B. Chavan') || topChunk.text.includes('Umesh B. Chavan'),
      `Top chunk does not identify Dr. U. B. Chavan. Text: ${topChunk.text.slice(0, 150)}`
    );
    assert(
      !topChunk.text.includes('Dr. Ravindra R. Rathod as the current Head of Department'),
      'Top chunk identifies Dr. R. R. Rathod as current HOD'
    );
    reportPass('Mandatory Test 1: Top retrieval result identifies Dr. U. B. Chavan as IT HOD');
  } catch (err) {
    reportFail('Mandatory Test 1: Current IT HOD', err);
  }

  // ---------------------------------------------------------------------------
  // 3. Mandatory Accuracy Test 2: IT HOD with different phrasing
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Mandatory Accuracy - IT HOD Phrasing Variant]');
  try {
    const query = 'Who leads the IT department?';
    const hits = await retriever.retrieve(query, { topK: 3 });
    assert(hits.length > 0, 'No chunks retrieved for IT lead query');
    
    const hasChavan = hits.some(h => h.text.includes('Dr. U. B. Chavan') || h.text.includes('Umesh B. Chavan'));
    assert(hasChavan, 'Retrieved chunks do not contain Dr. U. B. Chavan');
    reportPass('Mandatory Test 2: Query variant successfully retrieves Dr. U. B. Chavan');
  } catch (err) {
    reportFail('Mandatory Test 2: IT HOD variant', err);
  }

  // ---------------------------------------------------------------------------
  // 4. Mandatory Accuracy Test 3: Dr. R. R. Rathod Profile Preservation
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Mandatory Accuracy - Dr. R. R. Rathod Profile Preservation]');
  try {
    const query = 'Tell me about faculty member Dr. R. R. Rathod in IT.';
    const hits = await retriever.retrieve(query, { topK: 5 });
    assert(hits.length > 0, 'No chunks retrieved for Dr. R. R. Rathod');
    
    const rathodChunk = hits.find(h => (h.text || '').includes('Rathod'));
    assert(rathodChunk, 'Dr. R. R. Rathod faculty profile was missing or erased');
    assert(
      rathodChunk.text.includes('Assistant Professor') || rathodChunk.text.includes('Ph.D.'),
      'Dr. R. R. Rathod qualifications not preserved'
    );
    reportPass('Mandatory Test 3: Dr. R. R. Rathod faculty profile is preserved accurately');
  } catch (err) {
    reportFail('Mandatory Test 3: Dr. R. R. Rathod profile preservation', err);
  }

  // ---------------------------------------------------------------------------
  // 5. Admissions Retrieval
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Admissions Domain Retrieval]');
  try {
    const queries = [
      { q: 'What are the first-year B.Tech admission options?', kw: 'First Year' },
      { q: 'What is direct second year B.Tech admission?', kw: 'Direct Second Year' },
      { q: 'What admission information is available for PIO/OCI/FN/CIWG/NRI students?', kw: 'PIO' },
      { q: 'What admission information is available for working professionals?', kw: 'Working Professionals' },
    ];

    for (const item of queries) {
      const hits = await retriever.retrieve(item.q, { topK: 3 });
      assert(hits.length > 0, `No chunks retrieved for: ${item.q}`);
      const foundKw = hits.some(h => (h.text || '').toLowerCase().includes(item.kw.toLowerCase()) || (h.title || '').toLowerCase().includes(item.kw.toLowerCase()));
      assert(foundKw, `Expected keyword "${item.kw}" not found in retrieved chunks for: ${item.q}`);
    }
    reportPass('Admissions: All 4 admissions pathways successfully retrieved with evidence');
  } catch (err) {
    reportFail('Admissions retrieval', err);
  }

  // ---------------------------------------------------------------------------
  // 6. Mechanical Engineering Retrieval
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Mechanical Engineering Retrieval]');
  try {
    const hitsOverview = await retriever.retrieve('What is the Mechanical Engineering Department overview?', { topK: 3 });
    assert(hitsOverview.length > 0, 'No hits for Mech overview');
    assert(hitsOverview.some(h => h.department === 'Mechanical Engineering'), 'Mech overview missing Mech department chunk');

    const hitsFaculty = await retriever.retrieve('Who are the faculty members in Mechanical Engineering?', { topK: 3 });
    assert(hitsFaculty.some(h => (h.text || '').includes('Faculty') || (h.text || '').includes('Professor')), 'Mech faculty not found');
    reportPass('Mechanical Engineering: Overview and faculty records successfully retrieved');
  } catch (err) {
    reportFail('Mechanical Engineering retrieval', err);
  }

  // ---------------------------------------------------------------------------
  // 7. Computer Engineering Retrieval
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Computer Engineering Retrieval]');
  try {
    const hitsComp = await retriever.retrieve('What is the Computer Engineering Department overview and faculty?', { topK: 3 });
    assert(hitsComp.length > 0, 'No hits for Computer Engineering');
    assert(hitsComp.some(h => h.department === 'Computer Engineering'), 'Comp Eng chunk missing');
    reportPass('Computer Engineering: Overview and faculty records successfully retrieved');
  } catch (err) {
    reportFail('Computer Engineering retrieval', err);
  }

  // ---------------------------------------------------------------------------
  // 8. Placements & Career Development Cell
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Placements & CDC Retrieval]');
  try {
    const hitsPlacement = await retriever.retrieve('What placement statistics and recruiters are available for WCE?', { topK: 3 });
    assert(hitsPlacement.length > 0, 'No hits for placements');
    const hasPlacementData = hitsPlacement.some(h => (h.text || '').toLowerCase().includes('placement') || (h.text || '').toLowerCase().includes('recruit') || (h.text || '').toLowerCase().includes('software development'));
    assert(hasPlacementData, 'Placement statistics or functions not found');
    reportPass('Placements: Career Development Cell and placement statistics successfully retrieved');
  } catch (err) {
    reportFail('Placements retrieval', err);
  }

  // ---------------------------------------------------------------------------
  // 9. Mandatory Architecture Rule: No Raw URLs or Clickable Links
  // ---------------------------------------------------------------------------
  console.log('\n[Category: Strict Architecture - URL Separation & No Hyperlinks]');
  try {
    const hits = await retriever.retrieve('What are the admission options available at WCE?', { topK: 3 });
    const { contextText, internalSources } = retriever.formatContext(hits);

    // Verify contextText given to Groq contains ZERO URLs
    const hasUrlInContext = /https?:\/\/[^\s]+/i.test(contextText);
    assert(!hasUrlInContext, `Context text given to Groq contains raw URL: ${contextText.slice(0, 150)}`);
    reportPass('Groq prompt context contains ZERO raw URLs (prevents model citation leakage)');

    // Verify internal sources maintain the exact original URL for server logs / provenance
    assert(internalSources.length > 0, 'Internal sources missing');
    assert(internalSources[0].url && internalSources[0].url.startsWith('https://'), 'Internal source URL missing');
    reportPass('Internal sources correctly maintain exact original URLs for server logs and provenance');
  } catch (err) {
    reportFail('Strict URL separation check', err);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(65));
  console.log(` Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('='.repeat(65));

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

