/**
 * ==============================================================================
 * WCE Campus Assistant — Backend Server with Groq LLM + RAG Integration
 * ==============================================================================
 */

const path = require('path');
// Always load backend/.env explicitly regardless of current working directory
const envPath = path.resolve(__dirname, '.env');
require('dotenv').config({ path: envPath, override: true });

const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

// RAG retriever — lazy-loads the vector index on first query
const retriever = require('./rag/retriever');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const MAX_INPUT_LENGTH = 4000;

// Initialize Groq client with dynamic hot-reload support
let groqClient = null;

function getGroqClient() {
  // Hot-reload .env if key wasn't previously loaded
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

// CORS Configuration
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
// System Prompt for WCE Campus Assistant
// ------------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the official AI Campus Assistant for Walchand College of Engineering (WCE), Sangli — one of Maharashtra's premier autonomous engineering institutes, established in 1947.

Guidelines for your responses:
1. Provide helpful, respectful, and student-friendly information about WCE Sangli.
2. Cover topics accurately:
   - Programs: B.Tech (Civil, Mechanical, Electrical, Electronics, Computer Science & Engineering, Information Technology), M.Tech specializations, and Ph.D. programs.
   - Campus Facilities: Ajit Gulabchand Central Library, departments, computing centers, workshops, hostels, cafeteria, sports facilities, and gymnasium.
   - Campus Life: Student clubs (WLUG, ROTARACT, ACSES, ELESA, MESA, CESA, EESA, etc.), cultural festival (Gathering), and technical symposiums.
3. Keep answers concise, clear, and well-structured using markdown headings, bullet points, or bold text.
4. CRITICAL ACCURACY & INTEGRITY RULES:
   - Never fabricate official cut-off percentages, admission dates, fee figures, examination schedules, or private faculty contacts.
   - If an inquiry asks about specific live official dates or fees that vary year-to-year, state the general known procedure and direct the student to the official portal: http://www.walchandsangli.ac.in or the MHT-CET / CAP admission authorities.
   - When Retrieved Context Documents are provided below, prioritise them as the primary source of truth and cite them in your answer.
   - If no context is provided, answer transparently using your established knowledge.
5. If the user asks something outside the scope of WCE or higher education, politely guide them back to campus inquiries.`;

// ------------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------------

/**
 * Health check endpoint
 */
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

/**
 * Basic root route
 */
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
        sources: [],
      });
    }

    // Sanitize and format conversation history
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
          content: item.content.trim().slice(0, 2000),
        });
      }
    }

    // -------------------------------------------------------------------------
    // RAG — Retrieve relevant context from the vector index
    // -------------------------------------------------------------------------
    let contextPromptAddition = '';
    let sources = [];

    // If the client sent pre-fetched context (legacy path), use it;
    // otherwise attempt automatic RAG retrieval from the vector store.
    if (Array.isArray(req.body.context) && req.body.context.length > 0) {
      // Legacy client-supplied context
      contextPromptAddition = `\n\nRetrieved WCE Context Documents:\n${req.body.context
        .map((doc, idx) => `[Document ${idx + 1}]: ${doc.content || doc.text || doc}`)
        .join('\n\n')}`;

      req.body.context.forEach((doc, idx) => {
        if (typeof doc === 'object' && doc !== null) {
          sources.push({
            id: `src-${idx}`,
            title: doc.title || doc.name || `WCE Document ${idx + 1}`,
            url: doc.url || null,
            page: doc.page || null,
            snippet: doc.snippet || doc.content || null,
          });
        }
      });
    } else if (retriever.isIndexAvailable()) {
      // Automatic RAG retrieval using the local vector index
      try {
        const hits = await retriever.retrieve(userMessage, { topK: 5, minScore: 0.30 });
        const { contextText, sources: ragSources } = retriever.formatContext(hits);
        if (contextText) {
          contextPromptAddition = `\n\nRetrieved WCE Context Documents (ranked by relevance):\n${contextText}`;
          sources = ragSources;
        }
      } catch (ragErr) {
        // Non-fatal — degrade gracefully to LLM-only response
        console.warn('[RAG] Retrieval failed, falling back to LLM-only:', ragErr.message);
      }
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

    // Call Groq chat completions
    const completion = await groq.chat.completions.create({
      model: modelToUse,
      messages,
      temperature: 0.5,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });

    const answer =
      completion.choices?.[0]?.message?.content ||
      'I was unable to generate an answer for this inquiry. Please try rephrasing your question.';

    return res.status(200).json({
      answer,
      sources,
      model: completion.model || modelToUse,
    });
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
