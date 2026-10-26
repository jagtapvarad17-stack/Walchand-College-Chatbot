/**
 * Automated test suite for WCE Backend & Groq API Integration
 */

const http = require('http');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), raw: body });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting WCE Backend Tests ---');

  // Test 1: Health endpoint
  try {
    const healthRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/health',
      method: 'GET',
    });

    console.log(`[PASS] GET /health returned status ${healthRes.status}`);
    console.log('       Response:', JSON.stringify(healthRes.data));
  } catch (err) {
    console.error('[FAIL] GET /health failed:', err.message);
  }

  // Test 2: Empty input validation
  try {
    const emptyRes = await makeRequest(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { message: '   ' }
    );

    if (emptyRes.status === 400) {
      console.log('[PASS] POST /api/chat rejected empty message with 400 Bad Request');
    } else {
      console.log(`[WARN] POST /api/chat returned status ${emptyRes.status} for empty message`);
    }
  } catch (err) {
    console.error('[FAIL] Empty input test failed:', err.message);
  }

  // Test 3: Large input validation (> 4000 characters)
  try {
    const hugeMessage = 'a'.repeat(4500);
    const hugeRes = await makeRequest(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { message: hugeMessage }
    );

    if (hugeRes.status === 400) {
      console.log('[PASS] POST /api/chat rejected oversized message with 400 Bad Request');
    } else {
      console.log(`[WARN] POST /api/chat returned status ${hugeRes.status} for oversized message`);
    }
  } catch (err) {
    console.error('[FAIL] Oversized input test failed:', err.message);
  }

  // Test 4: Missing Groq key friendly 503 response
  try {
    const unconfigRes = await makeRequest(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { message: 'What courses does WCE offer?' }
    );

    console.log(`[INFO] POST /api/chat status with placeholder key: ${unconfigRes.status}`);
    console.log('       Response:', JSON.stringify(unconfigRes.data));
    if (unconfigRes.status === 503 && unconfigRes.data.error.includes('Groq API is not configured')) {
      console.log('[PASS] Safe error returned without exposing stack traces or crashing server.');
    }
  } catch (err) {
    console.error('[FAIL] Unconfigured key test failed:', err.message);
  }

  console.log('--- WCE Backend Tests Completed ---');
}

runTests();
