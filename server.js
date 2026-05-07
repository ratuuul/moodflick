import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── PASTE YOUR KEYS HERE ──────────────────────────────────────
process.env.GROQ_API_KEY = 'gsk_...';
process.env.TMDB_API_KEY = 'your_tmdb_key';
// ─────────────────────────────────────────────────────────────

const readBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { resolve(JSON.parse(body || '{}')); }
    catch { reject(new Error('Invalid JSON')); }
  });
});

function makeMockRes(res) {
  let statusCode = 200;
  const headers = {};

  const mock = {
    setHeader(k, v) { headers[k] = v; },
    status(code) {
      statusCode = code;
      return {
        json(data) {
          res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
          res.end(JSON.stringify(data));
        },
        end() {
          res.writeHead(statusCode, headers);
          res.end();
        }
      };
    },
    json(data) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(data));
    },
    end() {
      res.writeHead(statusCode, headers);
      res.end();
    }
  };
  return mock;
}

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  try {
    // API routes
    if (req.url === '/api/mood' && req.method === 'POST') {
      const body = await readBody(req);
      const { default: handler } = await import('./api/mood.js');
      return handler({ method: 'POST', body }, makeMockRes(res));
    }

    if (req.url === '/api/movies' && req.method === 'POST') {
      const body = await readBody(req);
      const { default: handler } = await import('./api/movies.js');
      return handler({ method: 'POST', body }, makeMockRes(res));
    }

    // Static files
    const filePath = path.join(
      __dirname, 'public',
      req.url === '/' ? 'index.html' : req.url
    );

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // fallback to index.html
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
    }

  } catch (e) {
    console.error('Server error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(3000, () => {
  console.log('');
  console.log('  MoodFlick running → http://localhost:3000');
  console.log('');
});
