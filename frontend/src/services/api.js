/**
 * API Service for WCE RAG Backend Integration
 * Handles requests, response normalization, source citations parsing, and backend health checks.
 */

// Configurable API Base URL via Vite environment variables
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  'http://localhost:5000';

const CHAT_ENDPOINT = `${API_BASE_URL.replace(/\/+$/, '')}/api/chat`;
const HEALTH_ENDPOINT = `${API_BASE_URL.replace(/\/+$/, '')}/health`;

/**
 * Normalizes source items returned by various RAG backend implementations
 * @param {Array} rawSources
 * @returns {Array} Clean source objects
 */
function normalizeSources(rawSources) {
  if (!Array.isArray(rawSources)) return [];

  return rawSources
    .map((src, index) => {
      if (!src) return null;

      // Handle string sources
      if (typeof src === 'string') {
        const isUrl = /^https?:\/\//i.test(src.trim());
        return {
          id: `source-${index}`,
          title: isUrl ? new URL(src).hostname : src,
          url: isUrl ? src.trim() : null,
          page: null,
          section: null,
          snippet: null,
        };
      }

      // Handle object sources
      const title =
        src.title ||
        src.document ||
        src.doc_name ||
        src.name ||
        src.source ||
        src.filename ||
        `Source Document ${index + 1}`;

      const rawUrl = src.url || src.link || src.href || src.source_url || null;
      const url = rawUrl && /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : null;

      const page =
        src.page ??
        src.page_number ??
        src.pageNumber ??
        src.metadata?.page ??
        src.metadata?.page_number ??
        null;

      const section =
        src.section ??
        src.chapter ??
        src.topic ??
        src.metadata?.section ??
        null;

      const snippet =
        src.snippet ??
        src.content ??
        src.text ??
        src.excerpt ??
        src.metadata?.text ??
        null;

      return {
        id: src.id || `source-${index}`,
        title: String(title),
        url,
        page: page !== null && page !== undefined ? String(page) : null,
        section: section ? String(section) : null,
        snippet: snippet ? String(snippet).trim() : null,
      };
    })
    .filter(Boolean);
}

/**
 * Checks backend health status
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(HEALTH_ENDPOINT, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);
    return res ? res.ok : false;
  } catch {
    return false;
  }
}

/**
 * Sends a user query to the RAG backend
 * @param {string} message - The user's query
 * @param {Array} history - Previous messages for conversation context
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<{ answer: string, sources: Array, timestamp: string }>}
 */
export async function sendChatMessage(message, history = [], signal = null) {
  if (!message || !message.trim()) {
    throw new Error('Message cannot be empty.');
  }

  // Format history for RAG context
  const formattedHistory = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .slice(-6)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  // Payload compatible with common RAG schemas
  const payload = {
    message: message.trim(),
    query: message.trim(),
    question: message.trim(),
    history: formattedHistory,
  };

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errorMsg = `Server error (${response.status})`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorData.message || errorMsg;
      } catch {
        // Fallback to status text
        if (response.statusText) {
          errorMsg = `${errorMsg}: ${response.statusText}`;
        }
      }
      const err = new Error(errorMsg);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();

    // Extract answer text across known field patterns
    const answer =
      data.answer ||
      data.response ||
      data.reply ||
      data.output ||
      data.message ||
      data.text ||
      (typeof data === 'string' ? data : '');

    // Extract citations / sources across known field patterns
    const rawSources =
      data.sources ||
      data.citations ||
      data.documents ||
      data.references ||
      data.context ||
      [];

    const sources = normalizeSources(rawSources);

    return {
      answer: answer || 'I received an empty response from the campus knowledge base.',
      sources,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }

    // Identify network failures (e.g., backend offline)
    const isNetworkError =
      err instanceof TypeError && err.message.includes('fetch');

    if (isNetworkError) {
      const offlineError = new Error(
        `Unable to connect to WCE RAG backend at ${API_BASE_URL}. Please ensure the backend server is running and CORS is enabled.`
      );
      offlineError.isOffline = true;
      offlineError.originalError = err;
      throw offlineError;
    }

    throw err;
  }
}
