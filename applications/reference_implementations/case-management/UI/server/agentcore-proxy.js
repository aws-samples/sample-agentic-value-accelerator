/**
 * Local proxy server:
 *   POST /api/sars-report  → fast DynamoDB report (no LLM)
 *   POST /api/chat          → AgentCore SAR Agent (LLM-powered chat)
 */
const http = require('http');
const { execFileSync, spawn } = require('child_process');
const path = require('path');

const PORT = 3001;
const REPORT_SCRIPT = path.resolve(__dirname, 'generate-report.py');
const CHAT_SCRIPT = path.resolve(__dirname, 'stream-agent.py');
const PYTHON = '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3';

function generateReport(src) {
  return execFileSync(PYTHON, [REPORT_SCRIPT], {
    input: JSON.stringify({ src }),
    encoding: 'utf-8', timeout: 15000, maxBuffer: 5 * 1024 * 1024,
  }).trim();
}

function chatWithAgent(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [CHAT_SCRIPT]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(err || out || `exit ${code}`));
      try {
        const parsed = JSON.parse(out.trim());
        resolve(parsed.response || out.trim());
      } catch { resolve(out.trim()); }
    });
    proc.on('error', reject);
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // --- SAR Report (fast, no LLM) ---
  if (req.method === 'POST' && req.url === '/api/sars-report') {
    const body = JSON.parse(await readBody(req));
    const acct = body.src || body.transaction?.accountId || 'unknown';
    try {
      console.log(`[SAR] report for ${acct}`);
      const t0 = Date.now();
      const report = generateReport(acct);
      console.log(`[SAR] done ${((Date.now()-t0)/1000).toFixed(1)}s`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, report }));
    } catch (err) {
      console.error('[SAR]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- Chat with AgentCore (LLM) — streamed via SSE ---
  if (req.method === 'POST' && req.url === '/api/chat') {
    const body = JSON.parse(await readBody(req));
    const prompt = body.message || '';
    console.log(`[CHAT] "${prompt.substring(0, 60)}..."`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const proc = spawn(PYTHON, [CHAT_SCRIPT]);

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.trim()) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    });

    proc.stderr.on('data', (d) => {
      // Ignore stderr (agentcore CLI noise)
    });

    proc.on('close', () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      console.log(`[CHAT] done`);
    });

    proc.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`);
      res.end();
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Proxy on http://localhost:${PORT}`);
  console.log(`  POST /api/sars-report  → DynamoDB report`);
  console.log(`  POST /api/chat         → AgentCore SAR Agent`);
});
