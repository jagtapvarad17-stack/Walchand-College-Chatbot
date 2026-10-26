/**
 * Responsible, rate-limited WCE web crawler and document retriever
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const {
  SEED_URLS,
  POLITE_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  USER_AGENT,
} = require('./config');

const {
  normalizeUrl,
  validateUrl,
  isPdfUrl,
  computeHash,
  generateDocumentId,
  extractAcademicYear,
} = require('./normalizer');

const { extractHtml } = require('./extractors/htmlExtractor');
const { extractPdf } = require('./extractors/pdfExtractor');
const {
  initStorage,
  loadExistingHashes,
  saveRecord,
  saveRawFile,
  loadManifest,
  saveManifest,
} = require('./storage');

// Custom HTTPS agent to handle Indian academic institutional certificate chains
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

/**
 * Helper to pause execution
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches content from a URL via HTTP/HTTPS with size caps, retries, and timeout
 * @param {string} targetUrl
 * @param {number} [maxBytes]
 * @returns {Promise<{ buffer: Buffer, contentType: string, statusCode: number }>}
 */
async function fetchWithRetry(targetUrl, maxBytes = MAX_HTML_BYTES, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects encountered while fetching ${targetUrl}`);
  }

  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      return await new Promise((resolve, reject) => {
        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          agent: isHttps ? httpsAgent : undefined,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/pdf,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: REQUEST_TIMEOUT_MS,
        };

        const req = client.request(options, (res) => {
          // Handle redirects (up to 5 levels)
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const redirectUrl = normalizeUrl(res.headers.location, targetUrl);
            res.resume();
            if (redirectUrl) {
              return resolve(fetchWithRetry(redirectUrl, maxBytes, redirectCount + 1));
            }
          }

          if (res.statusCode < 200 || res.statusCode >= 400) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''}`));
          }

          const contentLength = parseInt(res.headers['content-length'] || '0', 10);
          if (contentLength > maxBytes) {
            res.resume();
            return reject(new Error(`Content size (${contentLength} bytes) exceeds limit (${maxBytes} bytes)`));
          }

          const chunks = [];
          let totalBytes = 0;

          res.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
              res.destroy();
              return reject(new Error(`Downloaded data exceeded limit of ${maxBytes} bytes`));
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || '';
            resolve({ buffer, contentType, statusCode: res.statusCode, finalUrl: targetUrl });
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });

        req.on('error', (err) => reject(err));
        req.end();
      });
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw err;
      }
      await sleep(1000 * attempt);
    }
  }
}

/**
 * Parses robots.txt rules for the WCE domain
 * @returns {Promise<Array<string>>} List of disallowed path prefixes
 */
async function fetchRobotsDisallowedPaths() {
  const disallowed = ['/wp-admin/'];
  try {
    const robotsUrl = 'https://walchandsangli.ac.in/robots.txt';
    const { buffer } = await fetchWithRetry(robotsUrl, 100 * 1024);
    const text = buffer.toString('utf8');

    const lines = text.split('\n');
    let appliesToAll = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^User-agent:\s*\*/i.test(trimmed)) {
        appliesToAll = true;
      } else if (/^User-agent:/i.test(trimmed)) {
        appliesToAll = false;
      } else if (appliesToAll && /^Disallow:\s*(.+)/i.test(trimmed)) {
        const match = trimmed.match(/^Disallow:\s*(.+)/i);
        if (match && match[1].trim()) {
          disallowed.push(match[1].trim());
        }
      }
    }
  } catch (err) {
    console.warn('[Crawler] Could not fetch robots.txt, using standard WCE defaults:', err.message);
  }

  return [...new Set(disallowed)];
}

/**
 * Runs the ingestion crawler with configurable limits and options
 * @param {Object} [options]
 * @param {number} [options.maxPages]
 * @param {number} [options.maxDepth]
 * @param {boolean} [options.seedOnly]
 * @param {number} [options.delayMs]
 * @returns {Promise<Object>} Ingestion run report
 */
async function runIngestion(options = {}) {
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const maxDepth = options.seedOnly ? 0 : (options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const delayMs = options.delayMs || POLITE_DELAY_MS;

  console.log(`\x1b[36m=====================================================\x1b[0m`);
  console.log(`\x1b[36m WCE Data Ingestion Pipeline Starting\x1b[0m`);
  console.log(`\x1b[36m Max Pages: ${maxPages} | Max Depth: ${maxDepth} | Delay: ${delayMs}ms\x1b[0m`);
  console.log(`\x1b[36m=====================================================\x1b[0m`);

  initStorage();
  const { hashes: knownHashes, ids: knownIds } = await loadExistingHashes();
  const manifest = loadManifest();

  // Fetch robots.txt
  const disallowedPaths = await fetchRobotsDisallowedPaths();
  console.log(`[Crawler] Active robots.txt disallow rules: ${disallowedPaths.join(', ')}`);

  // Initialize crawl queue: [{ url, depth }]
  const queue = [];
  const queuedSet = new Set();
  const visitedSet = new Set();

  // Populate seed URLs
  for (const rawSeed of SEED_URLS) {
    const canonical = normalizeUrl(rawSeed);
    if (canonical && !queuedSet.has(canonical)) {
      queue.push({ url: canonical, depth: 0 });
      queuedSet.add(canonical);
    }
  }

  // Session Statistics
  const stats = {
    discovered_urls: queue.length,
    processed_pages: 0,
    extracted_html_pages: 0,
    extracted_pdf_pages: 0,
    scanned_ocr_required: 0,
    deduplicated_records_skipped: 0,
    skipped_urls: 0,
    failed_urls: 0,
  };

  while (queue.length > 0 && stats.processed_pages < maxPages) {
    const current = queue.shift();
    const { url, depth } = current;

    if (visitedSet.has(url)) continue;
    visitedSet.add(url);

    // Validate scope
    const validation = validateUrl(url);
    if (!validation.valid) {
      stats.skipped_urls += 1;
      manifest.urls[url] = { status: 'skipped', reason: validation.reason, timestamp: new Date().toISOString() };
      continue;
    }

    // Check robots.txt disallow
    const parsedObj = new URL(url);
    const isRobotsDisallowed = disallowedPaths.some(
      (p) => p !== '/' && parsedObj.pathname.startsWith(p)
    );
    if (isRobotsDisallowed) {
      stats.skipped_urls += 1;
      manifest.urls[url] = { status: 'skipped', reason: 'robots.txt disallow', timestamp: new Date().toISOString() };
      continue;
    }

    const isPdf = isPdfUrl(url);
    const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_HTML_BYTES;

    console.log(`[Crawling ${stats.processed_pages + 1}/${maxPages}] (${isPdf ? 'PDF' : 'HTML'} | d=${depth}) ${url}`);

    try {
      const { buffer, contentType } = await fetchWithRetry(url, maxBytes);
      stats.processed_pages += 1;
      const fetchedAt = new Date().toISOString();

      if (isPdf || contentType.includes('application/pdf')) {
        // Handle PDF Document
        const pdfFilename = `${generateDocumentId(url)}.pdf`;
        saveRawFile(`pdfs/${pdfFilename}`, buffer);

        const pdfResult = await extractPdf(buffer, url);
        let pdfRecordsAdded = 0;

        if (pdfResult.pages.length === 0) {
          stats.scanned_ocr_required += 1;
          const contentHash = computeHash('');
          const record = {
            document_id: generateDocumentId(url, 1),
            title: pdfResult.title,
            source_url: url,
            content_type: 'pdf',
            extracted_text: '',
            page_number: 1,
            fetched_at: fetchedAt,
            content_hash: contentHash,
            academic_year: extractAcademicYear('', url),
            extraction_status: 'scanned_ocr_required',
          };
          saveRecord(record);
        } else {
          for (const page of pdfResult.pages) {
            const contentHash = computeHash(page.text);
            const docId = generateDocumentId(url, page.page_number);

            if (knownHashes.has(contentHash)) {
              stats.deduplicated_records_skipped += 1;
              continue;
            }

            knownHashes.add(contentHash);
            knownIds.add(docId);

            const record = {
              document_id: docId,
              title: `${pdfResult.title} (Page ${page.page_number})`,
              source_url: url,
              content_type: 'pdf',
              extracted_text: page.text,
              page_number: page.page_number,
              fetched_at: fetchedAt,
              content_hash: contentHash,
              academic_year: extractAcademicYear(page.text, url),
              extraction_status: page.status,
            };

            saveRecord(record);
            pdfRecordsAdded += 1;
            stats.extracted_pdf_pages += 1;
            if (page.status === 'scanned_ocr_required') {
              stats.scanned_ocr_required += 1;
            }
          }
        }

        manifest.urls[url] = {
          status: 'extracted',
          content_type: 'pdf',
          num_pages: pdfResult.num_pages,
          records_saved: pdfRecordsAdded,
          is_scanned: pdfResult.is_scanned,
          fetched_at: fetchedAt,
        };
      } else {
        // Handle HTML Web Page
        const htmlText = buffer.toString('utf8');
        const htmlResult = await extractHtml(htmlText, url);

        const contentHash = computeHash(htmlResult.extracted_text);
        const docId = generateDocumentId(url, null);

        if (knownHashes.has(contentHash)) {
          stats.deduplicated_records_skipped += 1;
        } else {
          knownHashes.add(contentHash);
          knownIds.add(docId);

          const record = {
            document_id: docId,
            title: htmlResult.title,
            source_url: url,
            content_type: 'html',
            extracted_text: htmlResult.extracted_text,
            page_number: null,
            fetched_at: fetchedAt,
            content_hash: contentHash,
            academic_year: extractAcademicYear(htmlResult.extracted_text, url),
            extraction_status: htmlResult.extraction_status,
          };

          saveRecord(record);
          stats.extracted_html_pages += 1;
        }

        manifest.urls[url] = {
          status: 'extracted',
          content_type: 'html',
          title: htmlResult.title,
          content_hash: contentHash,
          fetched_at: fetchedAt,
        };

        // Discover and enqueue internal links if depth allows
        if (depth < maxDepth) {
          // Prioritize discovered PDF documents for academic schedules and notices
          const discovered = [...htmlResult.discovered_pdfs, ...htmlResult.discovered_links];
          for (const rawLink of discovered) {
            const canonicalLink = normalizeUrl(rawLink, url);
            if (
              canonicalLink &&
              !visitedSet.has(canonicalLink) &&
              !queuedSet.has(canonicalLink)
            ) {
              const val = validateUrl(canonicalLink);
              if (val.valid) {
                queue.push({ url: canonicalLink, depth: depth + 1 });
                queuedSet.add(canonicalLink);
                stats.discovered_urls += 1;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Crawler Error] Failed ${url}:`, err.message);
      stats.failed_urls += 1;
      manifest.urls[url] = {
        status: 'failed',
        error: err.message,
        fetched_at: new Date().toISOString(),
      };
    }

    // Polite rate-limiting delay between requests
    await sleep(delayMs);
  }

  // Update manifest summary
  manifest.last_run = new Date().toISOString();
  manifest.stats.discovered_urls = (manifest.stats.discovered_urls || 0) + stats.discovered_urls;
  manifest.stats.extracted_html_pages = (manifest.stats.extracted_html_pages || 0) + stats.extracted_html_pages;
  manifest.stats.extracted_pdf_pages = (manifest.stats.extracted_pdf_pages || 0) + stats.extracted_pdf_pages;
  manifest.stats.scanned_ocr_required = (manifest.stats.scanned_ocr_required || 0) + stats.scanned_ocr_required;
  manifest.stats.skipped_urls = (manifest.stats.skipped_urls || 0) + stats.skipped_urls;
  manifest.stats.failed_urls = (manifest.stats.failed_urls || 0) + stats.failed_urls;
  saveManifest(manifest);

  console.log(`\x1b[32m=====================================================\x1b[0m`);
  console.log(`\x1b[32m Ingestion Run Complete\x1b[0m`);
  console.log(`\x1b[32m Pages Processed:     ${stats.processed_pages}\x1b[0m`);
  console.log(`\x1b[32m HTML Extracted:      ${stats.extracted_html_pages}\x1b[0m`);
  console.log(`\x1b[32m PDF Pages Extracted: ${stats.extracted_pdf_pages}\x1b[0m`);
  console.log(`\x1b[32m OCR Required (Scan): ${stats.scanned_ocr_required}\x1b[0m`);
  console.log(`\x1b[32m Deduplicated / Skip: ${stats.deduplicated_records_skipped}\x1b[0m`);
  console.log(`\x1b[32m Discovered in Queue: ${stats.discovered_urls}\x1b[0m`);
  console.log(`\x1b[32m Failed Requests:     ${stats.failed_urls}\x1b[0m`);
  console.log(`\x1b[32m=====================================================\x1b[0m`);

  return stats;
}

module.exports = {
  runIngestion,
  fetchWithRetry,
};
