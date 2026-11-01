/**
 * ==============================================================================
 * WCE RAG Pipeline — Enhanced Source-Aware Retriever
 * ==============================================================================
 * Provides high-accuracy semantic + hybrid retrieval for WCE queries.
 * Features:
 *   - Semantic cosine similarity search
 *   - Authority-aware ranking for authoritative institutional overrides (IT HOD Dr. U. B. Chavan)
 *   - Department and domain intent weighting (IT, Mechanical, Computer, Admissions, Placement)
 *   - Strict separation of internal source metadata from LLM prompt context (no raw URLs given to Groq)
 *   - Deduplication of overlapping chunks
 * ==============================================================================
 */

'use strict';

const { embed } = require('./embedder');
const vectorStore = require('./vectorStore');

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.28;

function ensureStoreLoaded() {
  vectorStore.loadStore();
}

/**
 * Score boost heuristic for authority-aware and intent-aligned ranking
 */
function computeRelevanceBoost(chunk, queryLower) {
  let boost = 0;

  // 1. Authoritative Override Priority
  // If user asks about HOD, Head, leadership, or IT Department
  const isHodQuery = queryLower.includes('hod') ||
                     queryLower.includes('head') ||
                     queryLower.includes('leader') ||
                     queryLower.includes('chavan') ||
                     queryLower.includes('rathod') ||
                     queryLower.includes('director');

  if (chunk.is_authoritative_override) {
    if (isHodQuery && (queryLower.includes('it') || queryLower.includes('information') || queryLower.includes('chavan') || queryLower.includes('rathod') || queryLower.includes('hod') || queryLower.includes('head'))) {
      boost += 0.50; // Decisive boost for authoritative override
    }
  }

  // If asking specifically about Dr. R. R. Rathod's profile
  if (queryLower.includes('rathod')) {
    if ((chunk.text || '').toLowerCase().includes('rathod')) {
      boost += 0.35;
    }
  }

  // 2. Department Intent Matching
  const isItQuery = queryLower.includes('information technology') || /\bit\b/i.test(queryLower);
  const isMechQuery = queryLower.includes('mechanical') || /\bmech\b/i.test(queryLower);
  const isCompQuery = queryLower.includes('computer') || /\bcse\b/i.test(queryLower);
  const isAdmissionQuery = queryLower.includes('admission') || queryLower.includes('eligibility') || queryLower.includes('cut off') || queryLower.includes('cap') || queryLower.includes('pio') || queryLower.includes('nri') || queryLower.includes('first year') || queryLower.includes('direct second');
  const isPlacementQuery = queryLower.includes('placement') || queryLower.includes('recruit') || queryLower.includes('package') || queryLower.includes('cdc') || queryLower.includes('career') || queryLower.includes('internship') || queryLower.includes('salary');

  if (isItQuery && chunk.department === 'Information Technology') boost += 0.15;
  if (isMechQuery && chunk.department === 'Mechanical Engineering') boost += 0.15;
  if (isCompQuery && chunk.department === 'Computer Engineering') boost += 0.15;
  if (isAdmissionQuery && chunk.department === 'Admissions') boost += 0.15;
  if (isPlacementQuery && chunk.department === 'Training & Placement') boost += 0.15;

  // 3. Curriculum / Faculty category boost
  if ((queryLower.includes('faculty') || queryLower.includes('professor') || queryLower.includes('teacher')) && chunk.category === 'faculty') {
    boost += 0.15;
  }
  if ((queryLower.includes('curriculum') || queryLower.includes('syllabus') || queryLower.includes('course') || queryLower.includes('subject')) && chunk.category === 'curriculum') {
    boost += 0.15;
  }

  return boost;
}

/**
 * Retrieve the most relevant chunks for a user query.
 *
 * @param {string} query
 * @param {object} [opts]
 * @returns {Promise<Array>}
 */
async function retrieve(query, opts = {}) {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;

  ensureStoreLoaded();
  const stats = vectorStore.getStats();
  if (stats.totalChunks === 0) {
    return [];
  }

  const queryEmbedding = await embed(query);
  const rawHits = vectorStore.search(queryEmbedding, { topK: topK * 3, minScore: 0.15 });

  const queryLower = query.toLowerCase();

  // Apply authority & intent boosting
  const reranked = rawHits.map(hit => {
    const boost = computeRelevanceBoost(hit, queryLower);
    const finalScore = hit.score + boost;
    return {
      ...hit,
      semantic_score: hit.score,
      boost,
      score: Math.min(1.0, finalScore),
    };
  });

  // Filter by minScore and sort descending
  const qualified = reranked
    .filter(h => h.score >= minScore)
    .sort((a, b) => b.score - a.score);

  // Deduplicate near-identical snippets
  const dedupedHits = [];
  const seenTexts = [];

  for (const hit of qualified) {
    const textSnippet = hit.text.slice(0, 100);
    const isDuplicate = seenTexts.some(st => st === textSnippet);
    if (!isDuplicate) {
      seenTexts.push(textSnippet);
      const { embedding: _e, ...cleanHit } = hit;
      dedupedHits.push(cleanHit);
      if (dedupedHits.length >= topK) break;
    }
  }

  return dedupedHits;
}

function isIndexAvailable() {
  ensureStoreLoaded();
  return vectorStore.getStats().totalChunks > 0;
}

function getIndexStats() {
  ensureStoreLoaded();
  return vectorStore.getStats();
}

/**
 * Formats retrieved context for Groq prompt.
 * CRITICAL RULE: Never inject raw URLs into context text given to LLM,
 * to prevent the LLM from hallucinating or echoing website links.
 */
function formatContext(results) {
  if (!results || results.length === 0) {
    return { contextText: '', sources: [], internalSources: [] };
  }

  const contextParts = results.map((r, i) => {
    const meta = [
      r.title ? `Title: ${r.title}` : null,
      r.department ? `Department: ${r.department}` : null,
      r.category ? `Category: ${r.category}` : null,
      r.page_number ? `Page: ${r.page_number}` : null,
    ].filter(Boolean).join(' | ');

    // Strip any raw URLs inside the body text so Groq never sees raw URLs to hallucinate or echo
    const cleanTextWithoutUrls = (r.text || '')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)/gi, '$1')
      .replace(/https?:\/\/[^\s\)\],]+/gi, '[official portal]');

    return `[Evidence ${i + 1}] (${meta})\n${cleanTextWithoutUrls}`;
  });

  const contextText = contextParts.join('\n\n---\n\n');

  // Internal sources for logging / debugging only (NOT for frontend display)
  const internalSources = results.map((r, i) => ({
    id: `src-${i}`,
    title: r.title || `WCE Document ${i + 1}`,
    url: r.source_url || null,
    department: r.department || null,
    score: Math.round(r.score * 100) / 100,
    is_authoritative: Boolean(r.is_authoritative_override),
  }));

  return { contextText, sources: internalSources, internalSources };
}

module.exports = {
  retrieve,
  isIndexAvailable,
  getIndexStats,
  formatContext,
};
