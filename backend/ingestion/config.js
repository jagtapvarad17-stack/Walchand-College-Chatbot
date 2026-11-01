/**
 * WCE Data Ingestion Configuration
 */

const path = require('path');

const SEED_URLS = [
  // A. Homepage
  'https://walchandsangli.ac.in/',
  // B. Admissions
  'https://walchandsangli.ac.in/admissions/first-year-btech/',
  'https://walchandsangli.ac.in/admissions/first-year-of-btech-pio-oci-fn-ciwg-nri-students/',
  'https://walchandsangli.ac.in/admissions/direct-second-year-b-tech/',
  'https://walchandsangli.ac.in/admissions/btech-dse-working-professionals/',
  // C. Mechanical Engineering Department
  'https://walchandsangli.ac.in/department-of-mechanical-engineering/overview/',
  'https://walchandsangli.ac.in/department-of-mechanical-engineering/b-tech-curriculum-with-minors-mech/',
  'https://walchandsangli.ac.in/department-of-mechanical-engineering/m-tech-specialisations-and-curriculum-mech/',
  'https://walchandsangli.ac.in/department-of-mechanical-engineering/faculty-mech/',
  'https://walchandsangli.ac.in/department-of-mechanical-engineering/achievements-mech/',
  // D. Information Technology Department
  'https://walchandsangli.ac.in/department-of-information-technology/overview-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/b-tech-curriculum-with-minors-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/m-tech-specialisations-and-curriculum-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/academic-planning-activities-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/resources-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/faculty-it/',
  'https://walchandsangli.ac.in/department-of-information-technology/students-development-it/',
  // E. Computer Engineering Department
  'https://walchandsangli.ac.in/department-of-computer-engineering/overview/',
  'https://walchandsangli.ac.in/department-of-computer-engineering/b-tech-curriculum/',
  'https://walchandsangli.ac.in/department-of-computer-engineering/faculty/',
  // Career Development / Placement
  'https://walchandsangli.ac.in/student-careers/career-development-cell/placement-in-wce/',
  'https://walchandsangli.ac.in/student-careers/career-development-cell/trainings/',
  'https://walchandsangli.ac.in/student-careers/career-development-cell/internships/',
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
  DEFAULT_MAX_PAGES: 40,
  DEFAULT_MAX_DEPTH: 1,

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
