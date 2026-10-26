/**
 * ==============================================================================
 * WCE RAG Pipeline — Text Chunker
 * ==============================================================================
 * Splits extracted document text into overlapping chunks while preserving
 * metadata (title, source URL, content type, academic year, page numbers).
 *
 * Strategy: Word-boundary splitting with configurable size & overlap.
 * Approximate token count: 1 token ≈ 0.75 words (conservative estimate).
 * ==============================================================================
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_TOKENS = 600;    // target chunk size in tokens
const DEFAULT_OVERLAP_TOKENS = 100;  // overlap between consecutive chunks
const WORDS_PER_TOKEN = 0.75;        // words → tokens conversion factor

/**
 * Approximate token count from a string.
 * Uses a simple word-count heuristic (accurate enough for chunking decisions).
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Split on whitespace, filter empties
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount / WORDS_PER_TOKEN);
}

/**
 * Chunk a single document's extracted text into overlapping segments.
 *
 * @param {object} doc - A parsed document record from wce_documents.jsonl
 * @param {object} [options]
 * @param {number} [options.chunkTokens=600]   - Target tokens per chunk
 * @param {number} [options.overlapTokens=100] - Overlap tokens between chunks
 * @returns {object[]} Array of chunk objects
 */
function chunkDocument(doc, options = {}) {
  const chunkTokens   = options.chunkTokens   ?? DEFAULT_CHUNK_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  const chunkWords   = Math.round(chunkTokens   * WORDS_PER_TOKEN);
  const overlapWords = Math.round(overlapTokens * WORDS_PER_TOKEN);

  const rawText = (doc.extracted_text || '').trim();

  // Skip documents with insufficient content
  if (!rawText || rawText.length < 30) {
    return [];
  }

  // Split text into words, preserving natural sentence boundaries where possible
  const words = rawText.split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // If the entire document fits in one chunk, emit a single chunk
  if (totalWords <= chunkWords) {
    return [buildChunk(doc, rawText, 0, 0, 1, 1)];
  }

  const chunks = [];
  let chunkIndex = 0;
  let start = 0;

  while (start < totalWords) {
    const end = Math.min(start + chunkWords, totalWords);
    const chunkText = words.slice(start, end).join(' ');

    chunks.push(buildChunk(doc, chunkText, chunkIndex, start, null, null));
    chunkIndex++;

    // Advance by (chunkWords - overlapWords) to create overlap
    start += Math.max(1, chunkWords - overlapWords);

    // Stop if we've covered all words
    if (end >= totalWords) break;
  }

  // Patch total_chunks now that we know the count
  const total = chunks.length;
  chunks.forEach((c, i) => {
    c.chunk_index  = i;
    c.total_chunks = total;
  });

  return chunks;
}

/**
 * Build a single chunk metadata object.
 *
 * @private
 */
function buildChunk(doc, text, chunkIndex, wordOffset, totalChunks, _placeholder) {
  const chunkId = `${doc.document_id}_chunk_${chunkIndex}`;
  return {
    chunk_id:      chunkId,
    document_id:   doc.document_id,
    chunk_index:   chunkIndex,
    total_chunks:  totalChunks,        // patched later if null
    text:          text,
    token_estimate: estimateTokens(text),
    // Preserved metadata
    title:         doc.title         || '',
    source_url:    doc.source_url    || '',
    content_type:  doc.content_type  || 'unknown',
    academic_year: doc.academic_year || null,
    page_number:   doc.page_number   || null,
    word_offset:   wordOffset,
  };
}

/**
 * Chunk an array of documents.
 *
 * @param {object[]} documents - Array of parsed document records
 * @param {object}   [options]
 * @returns {object[]} All chunks from all documents
 */
function chunkDocuments(documents, options = {}) {
  const allChunks = [];
  for (const doc of documents) {
    const docChunks = chunkDocument(doc, options);
    allChunks.push(...docChunks);
  }
  return allChunks;
}

module.exports = {
  chunkDocument,
  chunkDocuments,
  estimateTokens,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
};
