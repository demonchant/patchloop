import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { Engine } from './lib/engine.mjs';
import { hashText, redact } from './lib/process.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const STATE_DIR = path.resolve(process.env.PATCHLOOP_DATA_DIR ?? path.join(ROOT, '.patchloop'));
const HOST = process.env.PATCHLOOP_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PATCHLOOP_PORT ?? 4173);
const store = new Store(path.join(STATE_DIR, 'state.json'));
const engine = new Engine(store);

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, value, type = 'application/json; charset=utf-8') {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
  res.end(body);
}

async function bodyJson(req, maxBytes = 16_000) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (Buffer.byteLength(input) > maxBytes) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  try { return JSON.parse(input || '{}'); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function sameOrigin(req) {
  const host = req.headers.host;
  if (!host) return false;
  let requestUrl;
  try { requestUrl = new URL(`http://${host}`); } catch { return false; }
  const hostname = requestUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return source.protocol === 'http:' && source.host.toLowerCase() === host.toLowerCase() && ['localhost', '127.0.0.1', '::1'].includes(source.hostname.replace(/^\[|\]$/g, '').toLowerCase());
  } catch { return false; }
}

async function route(req, res) {
  if (!sameOrigin(req)) return send(res, 403, { error: 'Request host or origin is not allowed.' });
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, name: 'PatchLoop', version: '1.0.0', mode: process.env.PATCHLOOP_TARGET_REPO ? 'configured' : 'bundled-demo' });
  if (req.method === 'GET' && url.pathname === '/api/preflight') return send(res, 200, await engine.preflight());
  if (req.method === 'GET' && url.pathname === '/api/targets') return send(res, 200, { targets: await engine.listTargets() });
  if (req.method === 'GET' && url.pathname === '/api/runs') return send(res, 200, { runs: await store.list() });

  if (req.method === 'POST' && url.pathname === '/api/runs') {
    const input = await bodyJson(req);
    const task = typeof input.task === 'string' ? input.task.trim() : '';
    const objective = typeof input.objective === 'string' ? input.objective.trim() : '';
    if (task.length < 12 || task.length > 1600) return send(res, 400, { error: 'Describe the change in 12–1600 characters.' });
    if (objective.length < 16 || objective.length > 1800) return send(res, 400, { error: 'Acceptance objective must be 16–1800 characters.' });
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(task + objective)) return send(res, 400, { error: 'Control characters are not allowed.' });
    if (engine.busy) return send(res, 409, { error: 'Another Kane or agent process is running.' });
    const targetId = typeof input.targetId === 'string' ? input.targetId : (process.env.PATCHLOOP_TARGET_REPO ? 'configured' : 'bundled-demo');
    const targets = await engine.listTargets();
    const selectedTarget = targets.find((target) => target.id === targetId);
    if (!selectedTarget || !selectedTarget.ready) return send(res, 400, { error: 'Selected target is unavailable. Refresh the repository list and choose a ready target.' });
    const run = await store.create({ task, objective, objectiveHash: hashText(objective), targetId });
    void engine.startVerification(run.id).catch((error) => store.update(run.id, (item) => { item.state = 'setup_error'; item.events.push({ at: new Date().toISOString(), type: 'setup_error', message: redact(error.message) }); }));
    return send(res, 202, { run });
  }

  const match = url.pathname.match(/^\/api\/runs\/([0-9a-f-]{36})(?:\/(repair|verify|diff))?$/i);
  if (match) {
    const [, id, action] = match;
    if (req.method === 'GET' && !action) {
      const run = await store.get(id);
      return run ? send(res, 200, { run }) : send(res, 404, { error: 'Run not found.' });
    }
    if (req.method === 'GET' && action === 'diff') {
      const diff = await engine.diff(id);
      return diff === null ? send(res, 404, { error: 'Run not found.' }) : send(res, 200, diff, 'text/x-diff; charset=utf-8');
    }
    if (req.method === 'POST' && action === 'verify') {
      if (engine.busy) return send(res, 409, { error: 'Another Kane or agent process is running.' });
      const run = await store.get(id);
      if (!run || !['needs_review', 'unresolved', 'inconclusive', 'setup_error'].includes(run.state)) return send(res, 409, { error: 'This task cannot be re-verified yet.' });
      void engine.startVerification(id).catch((error) => store.update(id, (item) => { item.state = 'setup_error'; item.events.push({ at: new Date().toISOString(), type: 'setup_error', message: redact(error.message) }); }));
      return send(res, 202, { accepted: true });
    }
    if (req.method === 'POST' && action === 'repair') {
      if (engine.busy) return send(res, 409, { error: 'Another Kane or agent process is running.' });
      const run = await store.get(id);
      if (!run || !['needs_review', 'agent_error'].includes(run.state)) return send(res, 409, { error: 'Only a recorded Kane failure or failed agent call can be retried.' });
      void engine.repair(id).catch((error) => store.update(id, (item) => { item.state = 'agent_error'; item.events.push({ at: new Date().toISOString(), type: 'agent_error', message: redact(error.message) }); }));
      return send(res, 202, { accepted: true });
    }
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (relative.includes('..') || relative.includes('\\')) return send(res, 400, 'Invalid path', 'text/plain; charset=utf-8');
    const file = path.join(PUBLIC, relative);
    try {
      if (!(await stat(file)).isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const content = await readFile(file);
      res.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] ?? 'application/octet-stream', 'content-length': content.length, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
      return res.end(content);
    } catch { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
  }
  return send(res, 405, { error: 'Method not allowed.' });
}

const server = createServer((req, res) => {
  void route(req, res).catch((error) => {
    if (res.headersSent) return res.destroy();
    send(res, error.status ?? 500, { error: error.status ? error.message : 'PatchLoop could not complete that request.' });
    if (!error.status) process.stderr.write(`${redact(error.message)}\n`);
  });
});

void engine.recoverInterrupted().then(() => server.listen(PORT, HOST, () => process.stdout.write(`PatchLoop listening at http://${HOST}:${PORT}\n`))).catch((error) => {
  process.stderr.write(`PatchLoop could not recover local runs: ${redact(error.message)}\n`);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
