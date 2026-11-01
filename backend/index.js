/**
 * ==============================================================================
 * WCE Campus Assistant — Backend Server with Groq LLM + Enhanced RAG Integration
 * ==============================================================================
 */

const path = require('path');
// Always load backend/.env explicitly regardless of current working directory
const envPath = path.resolve(__dirname, '.env');
require('dotenv').config({ path: envPath, override: true });

const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

// Enhanced RAG retriever
const retriever = require('./rag/retriever');

// Dedicated structured faculty store
const facultyStore = require('./rag/facultyStore');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const MAX_INPUT_LENGTH = 4000;

// Initialize Groq client with dynamic hot-reload support
let groqClient = null;

function getGroqClient() {
  let currentKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
  if (!currentKey || currentKey === 'your_groq_api_key_here') {
    require('dotenv').config({ path: envPath, override: true });
    currentKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
  }

  if (!currentKey || currentKey === 'your_groq_api_key_here' || currentKey.includes('placeholder')) {
    return null;
  }

  if (!groqClient || groqClient.apiKey !== currentKey) {
    groqClient = new Groq({ apiKey: currentKey });
  }

  return groqClient;
}

function getActiveModel() {
  return process.env.GROQ_MODEL ? process.env.GROQ_MODEL.trim() : 'llama-3.3-70b-versatile';
}

// Startup check
const initialKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
const isInitialConfigured =
  Boolean(initialKey) &&
  initialKey !== 'your_groq_api_key_here' &&
  !initialKey.includes('placeholder');

if (isInitialConfigured) {
  console.log(`\x1b[32m[INFO] Groq API Key detected. Model: ${getActiveModel()}\x1b[0m`);
} else {
  console.warn(
    '\x1b[33m[WARN] GROQ_API_KEY is not configured or is a placeholder in backend/.env.\x1b[0m'
  );
}

// ------------------------------------------------------------------------------
// Middleware Setup
// ------------------------------------------------------------------------------

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy for this origin.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// ------------------------------------------------------------------------------
// Authoritative System Prompt for WCE Assistant
// ------------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are WCE Assistant, the official AI assistant for Walchand College of Engineering (WCE), Sangli, Maharashtra, India.

You answer questions using the retrieved WCE knowledge-base context provided. Your goal is to be HELPFUL, COMPLETE, and ACCURATE.

=== AUTHORITATIVE FACTS ===
- The current Head of the Information Technology Department is Dr. U. B. Chavan (user-provided correction, pending official confirmation).
- Dr. R. R. Rathod is an Assistant Professor in the IT Department with Ph.D. qualification and 21 years experience. He is NOT the current IT HOD.

=== STRICT OUTPUT RULES (NEVER VIOLATE) ===
1. Do NOT generate any website URLs, hyperlinks, or markdown links in your response.
2. Do NOT invent any college facts, statistics, faculty details, or admission requirements.
3. Do NOT create citation footnotes or source references.
4. Do NOT claim user-provided corrections were independently verified by the official website.
5. All faculty, admission, and curriculum data must come from the retrieved context only.

=== RESPONSE QUALITY REQUIREMENTS ===
6. NEVER give a one-line answer when the question deserves a detailed explanation.
7. For list questions (faculty, courses, specialisations), provide the COMPLETE list — do not summarize or truncate.
8. For explanatory questions (what is X, how does X work, explain X), write multiple paragraphs with proper structure.
9. For admission process questions, give step-by-step numbered instructions.
10. For faculty questions, include Name, Designation, Administrative Position, Qualification, and Experience when available.
11. Use Markdown formatting appropriately:
    - Use bullet points (- item) for unordered lists.
    - Use numbered lists (1. step) for sequential steps.
    - Use tables for structured data like faculty lists or curriculum.
    - Use ## or ### headings to organize long multi-part answers.
12. Keep factual answers concise; give complete detail when explanation or enumeration is asked.
13. For "how many faculty" questions, state the count for each department clearly.
14. If the retrieved context does not contain sufficient information, say exactly: "The available knowledge base does not contain detailed information about this topic. Please visit the official WCE website for the latest details."
15. Address every part of the user question — do not answer only part of it.

=== RESPONSE LENGTH GUIDE ===
- Simple factual question (e.g., location, founding year): 2–4 sentences.
- Department overview or description: 3–5 paragraphs with sub-points.
- Faculty list request: Complete Markdown table with ALL records — absolutely no omissions.
- Admission process: Numbered steps covering eligibility, documents, and procedure.
- Curriculum or specialisations: Structured list of all available options with brief descriptions.
- Comparative or multi-part question: Separate headed sections for each part.

Your output should contain ONLY the answer. Do not start with "Based on the context..." or "According to the retrieved information...".`;

/**
 * Sanitizes model responses to guarantee no raw URLs or markdown hyperlinks leak through
 */
function sanitizeAnswer(text) {
  if (!text || typeof text !== 'string') return '';
  // Normalize non-breaking and special space characters
  let sanitized = text.replace(/[\u00A0\u200B\u200C\u200D\u202F\uFEFF]/g, ' ');
  // Convert [Anchor Text](https://...) to Anchor Text
  sanitized = sanitized.replace(/\[([^\]]+)\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)/gi, '$1');
  // Strip raw URLs (e.g. http://... or https://...)
  sanitized = sanitized.replace(/https?:\/\/[^\s\)\],]+/gi, '');
  // Collapse excessive blank space created by URL removal
  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ');
  return sanitized.trim();
}

// ------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------

app.get('/health', (req, res) => {
  const groq = getGroqClient();
  const ragStats = retriever.getIndexStats();
  res.status(200).json({
    status: 'ok',
    service: 'wce-campus-assistant-backend',
    groqConfigured: Boolean(groq),
    model: getActiveModel(),
    rag: {
      available: retriever.isIndexAvailable(),
      totalChunks: ragStats.totalChunks,
      indexUpdatedAt: ragStats.updated_at || null,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Walchand College of Engineering (WCE) Campus Assistant API',
    endpoints: {
      health: 'GET /health',
      chat: 'POST /api/chat',
    },
  });
});

/**
 * Primary Chat Endpoint
 * Returns: { reply: "..." }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const rawMessage = req.body.message || req.body.query || req.body.question;

    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return res.status(400).json({
        error: 'Please provide a non-empty message in the request body.',
      });
    }

    const userMessage = rawMessage.trim();

    if (userMessage.length > MAX_INPUT_LENGTH) {
      return res.status(400).json({
        error: `Message exceeds maximum allowable length of ${MAX_INPUT_LENGTH} characters.`,
      });
    }

    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({
        error:
          'Groq API is not configured on the backend server. Please add your GROQ_API_KEY to the backend/.env file to activate AI responses.',
      });
    }

    // Sanitize conversation history
    const incomingHistory = Array.isArray(req.body.history) ? req.body.history : [];
    const formattedHistory = [];
    const recentHistory = incomingHistory.slice(-6);

    for (const item of recentHistory) {
      if (
        item &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim()
      ) {
        if (
          item.role === 'user' &&
          item.content.trim() === userMessage &&
          item === recentHistory[recentHistory.length - 1]
        ) {
          continue;
        }

        formattedHistory.push({
          role: item.role,
          content: sanitizeAnswer(item.content.trim()).slice(0, 2000),
        });
      }
    }

    // -------------------------------------------------------------------------
    // RAG Retrieval
    // -------------------------------------------------------------------------
    let contextPromptAddition = '';
    let internalSources = [];
    let hasSufficientEvidence = false;

    if (retriever.isIndexAvailable()) {
      try {
        const hits = await retriever.retrieve(userMessage, { topK: 5, minScore: 0.28 });
        if (hits && hits.length > 0) {
          hasSufficientEvidence = true;
          const { contextText, internalSources: iSources } = retriever.formatContext(hits);
          if (contextText) {
            contextPromptAddition = `\n\nRetrieved Official WCE Knowledge Base Context (Primary Evidence):\n${contextText}`;
            internalSources = iSources;
          }
        }
      } catch (ragErr) {
        console.warn('[RAG] Retrieval error:', ragErr.message);
      }
    }

    // Log internal provenance for auditing without exposing to client
    if (internalSources.length > 0) {
      console.log(`[Provenance] Query: "${userMessage.slice(0, 60)}" -> Retrieved ${internalSources.length} sources: ${internalSources.map(s => s.title).join(', ')}`);
    }

    // Fallback if query cannot find relevant evidence
    if (!hasSufficientEvidence) {
      const fallbackReply = "I couldn't find verified information about this in the available WCE knowledge base. Please check the official college website for the latest details.";
      return res.status(200).json({
        reply: fallbackReply,
        answer: fallbackReply,
      });
    }

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT + contextPromptAddition,
      },
      ...formattedHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const modelToUse = getActiveModel();

    const completion = await groq.chat.completions.create({
      model: modelToUse,
      messages,
      temperature: 0.3, // Lower temperature for factual accuracy
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });

    const rawAnswer =
      completion.choices?.[0]?.message?.content ||
      'I was unable to generate an answer for this inquiry. Please try rephrasing your question.';

    // Strictly sanitize output to prevent hyperlinks or raw URLs
    const finalReply = sanitizeAnswer(rawAnswer);

    // Standard requested format
    const responsePayload = {
      reply: finalReply,
      answer: finalReply, // for backwards-compatibility with frontend
    };

    // Protected internal debug inspection
    if (req.query.debug === 'true') {
      responsePayload.debug_sources = internalSources;
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('[Error] Chat processing error:', err.message || err);

    if (err.status === 401 || err.name === 'AuthenticationError') {
      return res.status(401).json({
        error:
          'Groq authentication failed. Please check that your GROQ_API_KEY is valid and active in backend/.env.',
      });
    }

    if (err.status === 429 || err.name === 'RateLimitError') {
      return res.status(429).json({
        error:
          'Groq rate limit exceeded. Please wait a few seconds before submitting another question.',
      });
    }

    if (err.status === 400 || err.name === 'BadRequestError') {
      return res.status(400).json({
        error:
          `Invalid request to Groq (${err.message}). If the model '${getActiveModel()}' is unavailable, try setting GROQ_MODEL=llama-3.3-70b-versatile or llama-3.1-8b-instant in backend/.env.`,
      });
    }

    if (err.code === 'ETIMEDOUT' || err.name === 'APIConnectionTimeoutError') {
      return res.status(504).json({
        error: 'Connection to Groq API timed out. Please try your question again.',
      });
    }

    return res.status(500).json({
      error:
        'An error occurred while communicating with the campus AI service. Please try again later.',
    });
  }
});

// ------------------------------------------------------------------------------
// Server Startup
// ------------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`\x1b[36m===================================================\x1b[0m`);
  console.log(`\x1b[36m WCE Campus Assistant Backend Server running\x1b[0m`);
  console.log(`\x1b[36m Port:       http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36m Health:     http://localhost:${PORT}/health\x1b[0m`);
  console.log(`\x1b[36m Chat API:   POST http://localhost:${PORT}/api/chat\x1b[0m`);
  console.log(`\x1b[36m Model:      ${getActiveModel()}\x1b[0m`);
  console.log(`\x1b[36m===================================================\x1b[0m`);
});

module.exports = { app, server };
