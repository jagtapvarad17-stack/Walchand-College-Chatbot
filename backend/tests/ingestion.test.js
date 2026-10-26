/**
 * Test Suite for WCE Data Ingestion Pipeline
 * Tests URL filtering, content extraction, deduplication, and malformed document resilience
 */

const assert = require('assert');
const {
  normalizeUrl,
  validateUrl,
  isPdfUrl,
  cleanText,
  computeHash,
  generateDocumentId,
  extractAcademicYear,
} = require('../ingestion/normalizer');
const { extractHtml } = require('../ingestion/extractors/htmlExtractor');
const { extractPdf } = require('../ingestion/extractors/pdfExtractor');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`\x1b[32m  ✓ [PASS] ${name}\x1b[0m`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✗ [FAIL] ${name}\x1b[0m`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`\x1b[32m  ✓ [PASS] ${name}\x1b[0m`);
    testsPassed++;
  } catch (err) {
    console.error(`\x1b[31m  ✗ [FAIL] ${name}\x1b[0m`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log(' WCE Ingestion Pipeline — Test Suite');
  console.log('======================================================\n');

  // --- 1. URL Normalization & Filtering ---
  console.log('[Test Category: URL Normalization & Filtering]');

  runTest('Normalizes relative URLs against seed base', () => {
    const normalized = normalizeUrl('/admissions/btech', 'https://walchandsangli.ac.in/');
    assert.strictEqual(normalized, 'https://walchandsangli.ac.in/admissions/btech');
  });

  runTest('Strips tracking query parameters and hash fragments', () => {
    const raw = 'https://walchandsangli.ac.in/notices/?utm_source=fb&utm_medium=cpc#section2';
    const normalized = normalizeUrl(raw);
    assert.strictEqual(normalized, 'https://walchandsangli.ac.in/notices/');
  });

  runTest('Approves official WCE domains and subdomains', () => {
    const valid1 = validateUrl('https://walchandsangli.ac.in/campus-life/');
    const valid2 = validateUrl('https://www.walchandsangli.ac.in/departments');
    assert.strictEqual(valid1.valid, true);
    assert.strictEqual(valid2.valid, true);
  });

  runTest('Rejects external domains outside WCE scope', () => {
    const invalid1 = validateUrl('https://google.com');
    const invalid2 = validateUrl('https://unipune.ac.in');
    assert.strictEqual(invalid1.valid, false);
    assert.strictEqual(invalid2.valid, false);
  });

  runTest('Rejects disallowed paths (e.g. wp-admin, search queries)', () => {
    const admin = validateUrl('https://walchandsangli.ac.in/wp-admin/post.php');
    const search = validateUrl('https://walchandsangli.ac.in/?s=exam');
    assert.strictEqual(admin.valid, false);
    assert.strictEqual(search.valid, false);
  });

  runTest('Rejects non-content binary assets (images, fonts, archives)', () => {
    const image = validateUrl('https://walchandsangli.ac.in/uploads/logo.png');
    const font = validateUrl('https://walchandsangli.ac.in/fonts/inter.woff2');
    const zip = validateUrl('https://walchandsangli.ac.in/downloads/code.zip');
    assert.strictEqual(image.valid, false);
    assert.strictEqual(font.valid, false);
    assert.strictEqual(zip.valid, false);
  });

  runTest('Correctly identifies PDF document URLs', () => {
    assert.strictEqual(isPdfUrl('https://walchandsangli.ac.in/docs/timetable.pdf'), true);
    assert.strictEqual(isPdfUrl('https://walchandsangli.ac.in/admissions'), false);
  });

  // --- 2. Text Normalization & Academic Year ---
  console.log('\n[Test Category: Text Normalization & Metadata Extraction]');

  runTest('Normalizes excessive whitespace, NBSP, and carriage returns', () => {
    const messy = 'Walchand   College\u00A0of \r\n\r\n\r\nEngineering   \nSangli';
    const cleaned = cleanText(messy);
    assert.strictEqual(cleaned, 'Walchand College of\n\nEngineering\nSangli');
  });

  runTest('Extracts valid Academic Year patterns (e.g. 2024-25, 2025-26)', () => {
    const text1 = 'Admission criteria for Academic Year 2024-25 in B.Tech programs.';
    const text2 = 'Fee structure for session 2025-2026.';
    assert.strictEqual(extractAcademicYear(text1), '2024-25');
    assert.strictEqual(extractAcademicYear(text2), '2025-26');
  });

  runTest('Returns null when no academic year is mentioned', () => {
    const general = 'The Central Library is open from 8:00 AM to 8:00 PM.';
    assert.strictEqual(extractAcademicYear(general), null);
  });

  // --- 3. HTML Extraction ---
  console.log('\n[Test Category: HTML Content & Boilerplate Stripping]');

  runTest('Extracts title, headings, and main content while stripping navigation and footer', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admissions | Walchand College of Engineering, Sangli</title>
          <script>console.log("tracking");</script>
        </head>
        <body>
          <nav class="navbar"><a href="/">Home</a><a href="/login">Login</a></nav>
          <main>
            <h1>Undergraduate Admissions</h1>
            <p>Welcome to WCE Sangli admission portal for B.Tech degrees.</p>
            <h2>Eligibility</h2>
            <p>Candidates must appear for MHT-CET or JEE Main examination.</p>
            <table>
              <tr><th>Course</th><th>Intake</th></tr>
              <tr><td>Computer Science</td><td>120</td></tr>
            </table>
            <a href="/docs/prospectus_2024.pdf">Download Prospectus 2024</a>
            <a href="/admissions/eligibility">Detailed Eligibility</a>
          </main>
          <footer class="site-footer"><p>Copyright 2026 WCE Sangli</p></footer>
        </body>
      </html>
    `;

    const result = extractHtml(sampleHtml, 'https://walchandsangli.ac.in/admissions');

    assert.strictEqual(result.title, 'Undergraduate Admissions');
    assert.ok(result.headings.includes('Undergraduate Admissions'));
    assert.ok(result.headings.includes('Eligibility'));
    assert.ok(result.extracted_text.includes('Welcome to WCE Sangli admission portal'));
    assert.ok(result.extracted_text.includes('Computer Science | 120'));
    // Ensure scripts, nav, footer were stripped
    assert.ok(!result.extracted_text.includes('console.log'));
    assert.ok(!result.extracted_text.includes('Copyright 2026'));
    // Ensure PDF was discovered
    assert.strictEqual(result.discovered_pdfs.length, 1);
    assert.strictEqual(result.discovered_pdfs[0], '/docs/prospectus_2024.pdf');
    assert.strictEqual(result.extraction_status, 'success');
  });

  // --- 4. Deduplication & Deterministic IDs ---
  console.log('\n[Test Category: Deduplication & Hashing]');

  runTest('Generates consistent SHA-256 hash for identical text', () => {
    const textA = 'Walchand College of Engineering';
    const textB = 'Walchand College of Engineering';
    assert.strictEqual(computeHash(textA), computeHash(textB));
  });

  runTest('Generates deterministic document IDs based on URL and page number', () => {
    const id1 = generateDocumentId('https://walchandsangli.ac.in/notice', 1);
    const id2 = generateDocumentId('https://walchandsangli.ac.in/notice', 1);
    const id3 = generateDocumentId('https://walchandsangli.ac.in/notice', 2);
    assert.strictEqual(id1, id2);
    assert.notStrictEqual(id1, id3);
  });

  // --- 5. Malformed Input Resilience ---
  console.log('\n[Test Category: Malformed Documents & Scanned PDF Resilience]');

  runTest('Handles empty or malformed HTML safely without throwing', () => {
    const res = extractHtml(null, 'https://walchandsangli.ac.in/');
    assert.strictEqual(res.extraction_status, 'failed');
  });

  await runAsyncTest('Handles empty or corrupt PDF buffer safely without crashing', async () => {
    const corruptBuffer = Buffer.from('NOT_A_REAL_PDF_DATA_STREAM');
    const res = await extractPdf(corruptBuffer, 'https://walchandsangli.ac.in/corrupt.pdf');
    assert.strictEqual(res.extraction_status, 'failed');
    assert.strictEqual(res.pages.length, 0);
  });

  // Summary
  console.log('\n======================================================');
  console.log(` Test Results: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
