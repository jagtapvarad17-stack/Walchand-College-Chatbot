/**
 * Dataset persistence, JSONL storage, deduplication, and manifest tracking
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  DATA_DIR,
  PROCESSED_DIR,
  RAW_DIR,
  JSONL_FILE,
  MANIFEST_FILE,
} = require('./config');

/**
 * Ensures storage directories exist
 */
function initStorage() {
  [DATA_DIR, PROCESSED_DIR, RAW_DIR, path.join(RAW_DIR, 'pdfs')].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  if (!fs.existsSync(JSONL_FILE)) {
    fs.writeFileSync(JSONL_FILE, '', 'utf8');
  }

  if (!fs.existsSync(MANIFEST_FILE)) {
    const initialManifest = {
      version: '1.0',
      last_run: null,
      stats: {
        discovered_urls: 0,
        extracted_html_pages: 0,
        extracted_pdf_pages: 0,
        scanned_ocr_required: 0,
        skipped_urls: 0,
        failed_urls: 0,
      },
      urls: {},
    };
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(initialManifest, null, 2), 'utf8');
  }
}

/**
 * Loads existing content hashes and document IDs from the JSONL file for deduplication
 * @returns {Promise<{ hashes: Set<string>, ids: Set<string> }>}
 */
async function loadExistingHashes() {
  const hashes = new Set();
  const ids = new Set();

  if (!fs.existsSync(JSONL_FILE)) {
    return { hashes, ids };
  }

  const fileStream = fs.createReadStream(JSONL_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.content_hash) hashes.add(record.content_hash);
      if (record.document_id) ids.add(record.document_id);
    } catch {
      // Ignore corrupted lines
    }
  }

  return { hashes, ids };
}

/**
 * Appends a record to the JSONL dataset file
 * @param {Object} record
 */
function saveRecord(record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(JSONL_FILE, line, 'utf8');
}

/**
 * Saves a raw downloaded file to data/raw/
 * @param {string} relativeSubpath
 * @param {Buffer|string} content
 * @returns {string} Absolute path to stored file
 */
function saveRawFile(relativeSubpath, content) {
  const targetPath = path.join(RAW_DIR, relativeSubpath);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content);
  return targetPath;
}

/**
 * Loads the current manifest
 * @returns {Object}
 */
function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_FILE)) {
      const raw = fs.readFileSync(MANIFEST_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Storage] Failed to read manifest, creating fresh:', err.message);
  }

  return {
    version: '1.0',
    last_run: null,
    stats: {
      discovered_urls: 0,
      extracted_html_pages: 0,
      extracted_pdf_pages: 0,
      scanned_ocr_required: 0,
      skipped_urls: 0,
      failed_urls: 0,
    },
    urls: {},
  };
}

/**
 * Writes updated manifest to disk
 * @param {Object} manifest
 */
function saveManifest(manifest) {
  try {
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage] Error writing manifest:', err.message);
  }
}

/**
 * Reads sample records from the JSONL file
 * @param {number} [limit=3]
 * @returns {Promise<Array<Object>>}
 */
async function getSampleRecords(limit = 3) {
  const records = [];
  if (!fs.existsSync(JSONL_FILE)) return records;

  const fileStream = fs.createReadStream(JSONL_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
      if (records.length >= limit) break;
    } catch {
      // Ignore
    }
  }

  return records;
}

module.exports = {
  initStorage,
  loadExistingHashes,
  saveRecord,
  saveRawFile,
  loadManifest,
  saveManifest,
  getSampleRecords,
};
