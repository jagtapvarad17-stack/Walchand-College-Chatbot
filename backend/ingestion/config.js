/**
 * WCE Data Ingestion Configuration
 */

const path = require('path');

const SEED_URLS = [
  'https://walchandsangli.ac.in/',
  'https://walchandsangli.ac.in/admissions/',
  'https://walchandsangli.ac.in/campus-life/departments/',
  'https://walchandsangli.ac.in/academics-programmes/calendars-and-schedules/',
  'https://walchandsangli.ac.in/notices/',
];

const ALLOWED_DOMAINS = [
  'walchandsangli.ac.in',
  'www.walchandsangli.ac.in',
];

const DISALLOWED_PATH_PATTERNS = [
  /\/wp-admin\//i,
  /\/wp-login\.php/i,
  /\/wp-includes\//i,
  /\/feed\/?$/i,
  /\/xmlrpc\.php/i,
  /\?s=/i,              // search results
  /\/search\//i,
  /\/cart\/?$/i,
  /\/checkout\/?$/i,
  /\/my-account\/?$/i,
];

const IGNORED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff',
  '.css', '.js', '.mjs', '.map',
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.ogg',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso', '.exe', '.bin',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
]);

const DATA_DIR = path.resolve(__dirname, '../data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const RAW_DIR = path.join(DATA_DIR, 'raw');

module.exports = {
  SEED_URLS,
  ALLOWED_DOMAINS,
  DISALLOWED_PATH_PATTERNS,
  IGNORED_EXTENSIONS,

  // Crawler performance & etiquette
  POLITE_DELAY_MS: 700,
  REQUEST_TIMEOUT_MS: 15000,
  MAX_RETRIES: 2,
  DEFAULT_MAX_PAGES: 30,
  DEFAULT_MAX_DEPTH: 2,

  // Payload size constraints
  MAX_HTML_BYTES: 5 * 1024 * 1024,   // 5MB
  MAX_PDF_BYTES: 15 * 1024 * 1024,   // 15MB

  // User-Agent identifying crawler
  USER_AGENT: 'Mozilla/5.0 (compatible; WCE-RAG-Crawler/1.0; +https://walchandsangli.ac.in)',

  // Storage paths
  DATA_DIR,
  PROCESSED_DIR,
  RAW_DIR,
  JSONL_FILE: path.join(PROCESSED_DIR, 'wce_documents.jsonl'),
  MANIFEST_FILE: path.join(DATA_DIR, 'manifest.json'),
};
