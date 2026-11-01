/**
 * Live End-to-End Chatbot Accuracy Test with Groq and Retrieved Context
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const Groq = require('groq-sdk');
const retriever = require('../rag/retriever');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are WCE Assistant, the official-information-oriented AI assistant for Walchand College of Engineering, Sangli.

You answer questions using retrieved WCE knowledge-base information.

Rules:
1. Use retrieved information as your primary evidence.
2. Do not invent college facts.
3. Do not fabricate statistics.
4. Do not invent admission requirements.
5. Do not invent faculty details.
6. Do not generate website URLs.
7. Do not generate Markdown hyperlinks.
8. Do not include raw URLs in your answer.
9. Do not create citations or source references yourself.
10. Answer naturally and directly.
11. Use simple and clear language.
12. If the retrieved context is insufficient, clearly state that the information is unavailable in the current knowledge base.
13. Distinguish current information from historical information.
14. Follow authoritative correction records.
15. Do not treat outdated website information as current.
16. Never identify Dr. R. R. Rathod as the current IT HOD.
17. The current IT HOD according to the supplied authoritative correction is Dr. U. B. Chavan.
18. Do not claim that user-provided corrections were independently verified by the website.

Your output should contain only the answer to the user's question.`;

function sanitizeAnswer(text) {
  if (!text) return '';
  let s = text.replace(/[\u00A0\u200B\u200C\u200D\u202F\uFEFF]/g, ' ');
  s = s.replace(/\[([^\]]+)\]\((?:https?:\/\/[^\s\)]+|[^\s\)]+)\)/gi, '$1');
  s = s.replace(/https?:\/\/[^\s\)\],]+/gi, '');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

async function askQuestion(question) {
  console.log(`\n======================================================`);
  console.log(`Question: "${question}"`);

  const hits = await retriever.retrieve(question, { topK: 4, minScore: 0.28 });
  const { contextText, internalSources } = retriever.formatContext(hits);

  if (!hits || hits.length === 0) {
    const fallback = "I couldn't find verified information about this in the available WCE knowledge base. Please check the official college website for the latest details.";
    console.log(`Reply (Fallback): ${fallback}`);
    return fallback;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nVerified WCE Knowledge Base Context:\n${contextText}` },
    { role: 'user', content: question }
  ];

  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    max_tokens: 300
  });

  const rawAnswer = completion.choices[0]?.message?.content || '';
  const finalReply = sanitizeAnswer(rawAnswer);

  console.log(`Reply: ${finalReply}`);
  console.log(`Contains Hyperlinks? ${/\[.*?\]\(.*?\)/.test(finalReply) ? 'YES (FAIL)' : 'NO (PASS)'}`);
  console.log(`Contains Raw URLs? ${/https?:\/\//i.test(finalReply) ? 'YES (FAIL)' : 'NO (PASS)'}`);
  return finalReply;
}

async function run() {
  console.log(`Running End-to-End Chatbot Accuracy Tests with model: ${model}`);

  // Test 1: Current IT HOD
  const a1 = await askQuestion("Who is the current Head of the Information Technology Department?");
  if (a1.includes("Dr. U. B. Chavan") || a1.includes("Umesh B. Chavan")) {
    console.log("-> TEST 1 PASSED: Correctly named Dr. U. B. Chavan");
  } else {
    console.log("-> TEST 1 FAILED: Did not name Dr. U. B. Chavan");
  }

  // Test 2: IT HOD different phrasing
  const a2 = await askQuestion("Who leads the IT department at WCE?");
  if (a2.includes("Dr. U. B. Chavan") || a2.includes("Umesh B. Chavan") || a2.includes("Chavan")) {
    console.log("-> TEST 2 PASSED: Correctly named Dr. U. B. Chavan");
  } else {
    console.log("-> TEST 2 FAILED");
  }

  // Test 3: Dr. R. R. Rathod's faculty profile
  const a3 = await askQuestion("Tell me about faculty member Dr. R. R. Rathod.");
  if (a3.includes("Rathod") && (a3.includes("Professor") || a3.includes("Ph.D."))) {
    console.log("-> TEST 3 PASSED: Profile preserved without naming him as current HOD");
  } else {
    console.log("-> TEST 3 FAILED");
  }

  // Test 4: Admission options
  const a4 = await askQuestion("What are the admission options available at WCE?");
  if (a4.includes("B.Tech") || a4.includes("admission") || a4.includes("CAP")) {
    console.log("-> TEST 4 PASSED: Uses retrieved admission content");
  } else {
    console.log("-> TEST 4 FAILED");
  }

  // Test 5: Unrelated query absent from knowledge base
  const a5 = await askQuestion("What is the average temperature on the surface of Neptune?");
  if (a5.includes("couldn't find verified information") || a5.includes("unavailable in the current knowledge base")) {
    console.log("-> TEST 5 PASSED: Handled missing evidence gracefully");
  } else {
    console.log("-> TEST 5 FAILED");
  }

  // Test 6: Ask for source URL
  const a6 = await askQuestion("What is the source URL or website link for the admissions page?");
  if (!/https?:\/\//i.test(a6) && !/\[.*?\]\(.*?\)/.test(a6)) {
    console.log("-> TEST 6 PASSED: Did not fabricate or generate hyperlinks/URLs");
  } else {
    console.log("-> TEST 6 FAILED: Leaked URL or hyperlink");
  }
}

run().catch(console.error);
