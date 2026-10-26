/**
 * PDF Content and Page-by-Page Metadata Extractor
 */

const { PDFParse } = require('pdf-parse');
const { cleanText } = require('../normalizer');

/**
 * Extracts page-by-page text from a PDF Buffer
 * @param {Buffer} pdfBuffer
 * @param {string} sourceUrl
 * @returns {Promise<{
 *   title: string,
 *   num_pages: number,
 *   pages: Array<{ page_number: number, text: string, status: string }>,
 *   is_scanned: boolean,
 *   extraction_status: 'success' | 'scanned_ocr_required' | 'failed'
 * }>}
 */
async function extractPdf(pdfBuffer, sourceUrl) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    return {
      title: 'Invalid PDF',
      num_pages: 0,
      pages: [],
      is_scanned: false,
      extraction_status: 'failed',
    };
  }

  let parser = null;

  try {
    parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo().catch(() => null);

    const pages = [];
    const numPages = textResult.total || (textResult.pages ? textResult.pages.length : 0);

    let totalTextLen = 0;

    if (Array.isArray(textResult.pages)) {
      for (const p of textResult.pages) {
        const cleaned = cleanText(p.text || '');
        totalTextLen += cleaned.length;
        pages.push({
          page_number: p.num || pages.length + 1,
          text: cleaned,
          status: cleaned.length > 20 ? 'success' : 'scanned_ocr_required',
        });
      }
    }

    // Scanned document detection: average characters per page < 30
    const isScanned = numPages > 0 && (totalTextLen / numPages) < 30;

    // Document title resolution
    let title = infoResult?.info?.Title ? String(infoResult.info.Title).trim() : '';
    if (!title || title.length < 3 || title.toLowerCase() === 'untitled') {
      try {
        const urlObj = new URL(sourceUrl);
        const filename = urlObj.pathname.split('/').pop() || 'wce-document.pdf';
        title = decodeURIComponent(filename)
          .replace(/\.pdf$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      } catch {
        title = 'WCE PDF Document';
      }
    }

    const extraction_status = isScanned
      ? 'scanned_ocr_required'
      : totalTextLen > 40
      ? 'success'
      : 'scanned_ocr_required';

    return {
      title,
      num_pages: numPages,
      pages,
      is_scanned: isScanned,
      extraction_status,
    };
  } catch (err) {
    return {
      title: 'Malformed PDF',
      num_pages: 0,
      pages: [],
      is_scanned: false,
      extraction_status: 'failed',
      error: err.message,
    };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

module.exports = {
  extractPdf,
};
