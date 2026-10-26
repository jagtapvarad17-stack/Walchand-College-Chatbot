#!/usr/bin/env node
/**
 * CLI Runner for WCE Data Ingestion Pipeline
 * Usage:
 *   node ingestion/index.js [options]
 *
 * Options:
 *   --max-pages=N, -n N   Maximum number of pages/documents to fetch (default: 30)
 *   --max-depth=N, -d N   Maximum link crawl depth (default: 2)
 *   --seed-only           Only fetch the configured seed URLs (depth = 0)
 *   --delay=N             Polite delay between requests in milliseconds (default: 700)
 *   --sample              Display sample extracted records from storage
 *   --help, -h            Show help
 */

const { runIngestion } = require('./crawler');
const { getSampleRecords, loadManifest } = require('./storage');
const { JSONL_FILE, MANIFEST_FILE } = require('./config');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      console.log(`
WCE Data Ingestion CLI
Usage: node ingestion/index.js [options]

Options:
  --max-pages=N, -n N    Maximum pages/documents to fetch (default: 30)
  --max-depth=N, -d N    Maximum crawl depth (default: 2)
  --seed-only            Only ingest configured seed URLs without following links
  --delay=N              Polite delay between requests in ms (default: 700)
  --sample               Show sample records from processed dataset
  --help, -h             Show this help menu
      `);
      process.exit(0);
    }

    if (arg.startsWith('--max-pages=')) {
      options.maxPages = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-n' && args[i + 1]) {
      options.maxPages = parseInt(args[++i], 10);
    } else if (arg.startsWith('--max-depth=')) {
      options.maxDepth = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-d' && args[i + 1]) {
      options.maxDepth = parseInt(args[++i], 10);
    } else if (arg === '--seed-only') {
      options.seedOnly = true;
    } else if (arg.startsWith('--delay=')) {
      options.delayMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--sample') {
      options.showSample = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (options.showSample) {
    console.log('\n--- Sample Processed WCE Records ---');
    const samples = await getSampleRecords(3);
    if (samples.length === 0) {
      console.log('No records found yet. Run `npm run ingest` to start ingestion.');
    } else {
      samples.forEach((rec, idx) => {
        console.log(`\n[Record #${idx + 1}]`);
        console.log(`Document ID:     ${rec.document_id}`);
        console.log(`Title:           ${rec.title}`);
        console.log(`Source URL:      ${rec.source_url}`);
        console.log(`Content Type:    ${rec.content_type}`);
        console.log(`Page Number:     ${rec.page_number !== null ? rec.page_number : 'N/A'}`);
        console.log(`Academic Year:   ${rec.academic_year || 'Not specified'}`);
        console.log(`Status:          ${rec.extraction_status}`);
        console.log(`Content Hash:    ${rec.content_hash.slice(0, 16)}...`);
        console.log(`Fetched At:      ${rec.fetched_at}`);
        console.log(`Text Preview:    ${rec.extracted_text.slice(0, 180).replace(/\n/g, ' ')}...`);
      });
    }
    return;
  }

  const startTime = Date.now();
  try {
    const stats = await runIngestion(options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\nExecution completed in ${duration}s.`);
    console.log(`Cleaned Dataset: ${JSONL_FILE}`);
    console.log(`Crawl Manifest:  ${MANIFEST_FILE}`);

    // Print sample records after successful crawl
    console.log('\n--- Sample Extracted Records ---');
    const samples = await getSampleRecords(2);
    samples.forEach((rec, idx) => {
      console.log(`\nSample ${idx + 1}:`);
      console.log(`- ID:     ${rec.document_id}`);
      console.log(`- Title:  ${rec.title}`);
      console.log(`- Type:   ${rec.content_type}`);
      console.log(`- URL:    ${rec.source_url}`);
      console.log(`- Status: ${rec.extraction_status}`);
      console.log(`- Text:   "${rec.extracted_text.slice(0, 140).replace(/\s+/g, ' ')}..."`);
    });
  } catch (err) {
    console.error('\n[Fatal Error during Ingestion]:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
