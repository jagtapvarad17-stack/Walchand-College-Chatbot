/**
 * URL normalization, validation, text cleaning, hashing, and metadata extraction
 */

const crypto = require('crypto');
const { ALLOWED_DOMAINS, DISALLOWED_PATH_PATTERNS, IGNORED_EXTENSIONS } = require('./config');

/**
 * Normalizes a URL to a canonical format for crawling and deduplication
 * @param {string} rawUrl
 * @param {string} [baseUrl]
 * @returns {string|null}
 */
function normalizeUrl(rawUrl, baseUrl = null) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    // Resolve relative URLs against baseUrl
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);

    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Force https if domain matches WCE
    if (parsed.hostname.includes('walchandsangli.ac.in')) {
      parsed.protocol = 'https:';
    }

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip common tracking query params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    // Remove hash anchor
    parsed.hash = '';

    // Standardize path: remove duplicate slashes
    parsed.pathname = parsed.pathname.replace(/\/+/g, '/');

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validates whether a URL is within the approved crawling scope
 * @param {string} urlString
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateUrl(urlString) {
  if (!urlString) return { valid: false, reason: 'Empty URL' };

  try {
    const parsed = new URL(urlString);

    // Domain check
    const isDomainAllowed = ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (!isDomainAllowed) {
      return { valid: false, reason: `External domain: ${parsed.hostname}` };
    }

    // Disallowed path patterns check
    const fullPathWithQuery = parsed.pathname + parsed.search;
    for (const pattern of DISALLOWED_PATH_PATTERNS) {
      if (pattern.test(fullPathWithQuery)) {
        return { valid: false, reason: `Disallowed path pattern: ${pattern}` };
      }
    }

    // File extension check
    const lowerPath = parsed.pathname.toLowerCase();
    for (const ext of IGNORED_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) {
        return { valid: false, reason: `Ignored file extension: ${ext}` };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL' };
  }
}

/**
 * Identifies if a URL targets a PDF document
 * @param {string} urlString
 * @returns {boolean}
 */
function isPdfUrl(urlString) {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Cleans and normalizes extracted text while preserving semantic structure
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';

  return (
    text
      // Replace non-breaking spaces and zero-width spaces
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Strip horizontal trailing whitespace from lines
      .replace(/[ \t]+$/gm, '')
      // Collapse multiple horizontal spaces/tabs into single space
      .replace(/[ \t]{2,}/g, ' ')
      // Collapse 3 or more blank lines into 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Computes SHA-256 hash of a string
 * @param {string} content
 * @returns {string}
 */
function computeHash(content) {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
}

/**
 * Creates a deterministic document ID from URL and optional page number
 * @param {string} canonicalUrl
 * @param {number|null} [pageNumber]
 * @returns {string}
 */
function generateDocumentId(canonicalUrl, pageNumber = null) {
  const seed = pageNumber !== null && pageNumber !== undefined
    ? `${canonicalUrl}#page=${pageNumber}`
    : canonicalUrl;
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `wce_${hash}`;
}

/**
 * Extracts Academic Year if present in content or URL (e.g. "2024-25", "2024-2025")
 * @param {string} text
 * @param {string} [url]
 * @returns {string|null}
 */
function extractAcademicYear(text, url = '') {
  const combined = `${url} ${(text || '').slice(0, 3000)}`;

  // Matches 2023-24, 2024-25, 2025-26, 2024-2025
  const match = combined.match(/\b(20\d{2})[-–—/](\d{2,4})\b/);
  if (!match) return null;

  const startYear = parseInt(match[1], 10);
  let endYearStr = match[2];

  // If 4-digit end year (e.g. 2025), take last 2 digits
  if (endYearStr.length === 4) {
    endYearStr = endYearStr.slice(2);
  }

  const endYear = parseInt(endYearStr, 10);

  // Validate that endYear is startYear + 1 (standard academic year convention)
  if (endYear === (startYear + 1) % 100) {
    return `${startYear}-${endYear.toString().padStart(2, '0')}`;
  }

  return null;
}

module.exports = {
  normalizeUrl,
  validateUrl,
  isPdfUrl,
  cleanText,
  computeHash,
  generateDocumentId,
  extractAcademicYear,
};
