/**
 * HTML Content and Metadata Extractor
 */

const cheerio = require('cheerio');
const { cleanText } = require('../normalizer');

/**
 * Extracts structured text, headings, title, and links from an HTML document
 * @param {string} htmlContent
 * @param {string} sourceUrl
 * @returns {{
 *   title: string,
 *   extracted_text: string,
 *   headings: Array<string>,
 *   discovered_links: Array<string>,
 *   discovered_pdfs: Array<string>,
 *   extraction_status: 'success' | 'partial' | 'failed'
 * }}
 */
function extractHtml(htmlContent, sourceUrl) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return {
      title: 'Untitled Document',
      extracted_text: '',
      headings: [],
      discovered_links: [],
      discovered_pdfs: [],
      extraction_status: 'failed',
    };
  }

  const $ = cheerio.load(htmlContent);

  // 1. Extract Links & PDFs before removing elements
  const discovered_links = [];
  const discovered_pdfs = [];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href');
    if (!rawHref) return;

    const trimmed = rawHref.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return;
    }

    if (trimmed.toLowerCase().endsWith('.pdf') || trimmed.toLowerCase().includes('.pdf?')) {
      discovered_pdfs.push(trimmed);
    } else {
      discovered_links.push(trimmed);
    }
  });

  // 2. Extract Title
  let rawTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').text() ||
    '';

  let title = cleanText(rawTitle)
    .replace(/\s*[-–|•]\s*Walchand College of Engineering.*$/i, '')
    .replace(/\s*[-–|•]\s*WCE.*$/i, '')
    .trim();

  if (!title) {
    try {
      const urlObj = new URL(sourceUrl);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      title = segments.length > 0
        ? segments[segments.length - 1].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'WCE Home';
    } catch {
      title = 'WCE Document';
    }
  }

  // 3. Extract Headings
  const headings = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const hText = cleanText($(el).text());
    if (hText && hText.length > 2 && !headings.includes(hText)) {
      headings.push(hText);
    }
  });

  // 4. Remove boilerplate, interactive, and non-content elements
  const elementsToRemove = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'iframe',
    'header',
    'footer',
    'nav',
    '.nav',
    '.navbar',
    '.menu',
    '.site-header',
    '.site-footer',
    '.main-header',
    '.footer-widgets',
    '.copyright',
    '#header',
    '#footer',
    '#nav',
    '#sidebar',
    '.sidebar',
    '.widget-area',
    '.social-share',
    '.cookie-banner',
    '.breadcrumb',
    'form',
  ];

  elementsToRemove.forEach((sel) => $(sel).remove());

  // 5. Structure tables into readable format
  $('table').each((_, tbl) => {
    const rows = [];
    $(tbl).find('tr').each((_, tr) => {
      const cells = [];
      $(tr).find('th, td').each((_, cell) => {
        cells.push($(cell).text().trim().replace(/\s+/g, ' '));
      });
      if (cells.length > 0) {
        rows.push(cells.join(' | '));
      }
    });
    if (rows.length > 0) {
      $(tbl).replaceWith(`\n\n[TABLE]\n${rows.join('\n')}\n[/TABLE]\n\n`);
    }
  });

  // 6. Target Main Content Area
  let contentEl =
    $('main').length ? $('main') :
    $('article').length ? $('article') :
    $('.entry-content').length ? $('.entry-content') :
    $('#content').length ? $('#content') :
    $('.page-content').length ? $('.page-content') :
    $('body');

  const rawExtractedText = contentEl.text();
  const extracted_text = cleanText(rawExtractedText);

  const extraction_status = extracted_text.length >= 60 ? 'success' : 'partial';

  return {
    title,
    extracted_text,
    headings,
    discovered_links,
    discovered_pdfs,
    extraction_status,
  };
}

module.exports = {
  extractHtml,
};
