import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { Engine } from './lib/engine.mjs';
import { redact } from './lib/process.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.PATCHLOOP_DATA_DIR ?? path.join(ROOT, '.patchloop'));
const AUTH_MODE = process.env.PATCHLOOP_AUTH_MODE ?? 'local';
const EXECUTION_MODE = process.env.PATCHLOOP_EXECUTION_MODE ?? (AUTH_MODE === 'google' ? 'worker' : 'local');
const HOSTED = AUTH_MODE === 'google';
const PUBLIC_URL = process.env.PATCHLOOP_PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
const HOST = process.env.PATCHLOOP_HOST ?? (HOSTED ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.PORT ?? process.env.PATCHLOOP_PORT ?? 4173);
const GOOGLE_ID = process.env.PATCHLOOP_GOOGLE_CLIENT_ID;
const GOOGLE_SECRET = process.env.PATCHLOOP_GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.PATCHLOOP_SESSION_SECRET;
if (!['local', 'google'].includes(AUTH_MODE)) throw new Error('PATCHLOOP_AUTH_MODE must be local or google.');
if (!['disabled', 'local', 'worker'].includes(EXECUTION_MODE)) throw new Error('PATCHLOOP_EXECUTION_MODE must be disabled, local or worker.');
if (HOSTED && EXECUTION_MODE === 'local') throw new Error('Hosted mode cannot execute local processes on the web service.');
if (HOSTED && EXECUTION_MODE === 'worker' && (!GOOGLE_ID || !GOOGLE_SECRET || !SESSION_SECRET || !PUBLIC_URL)) throw new Error('Google OAuth, session secret and public URL must be configured.');
if (HOSTED && !PUBLIC_URL) throw new Error('PATCHLOOP_PUBLIC_URL or RENDER_EXTERNAL_URL is required in hosted mode.');

const store = new Store(path.join(DATA, 'state.json'));
const engine = new Engine(store);
const pendingPairCodes = new Map();
const pendingOAuth = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const allowedStates = new Set(['queued', 'verifying', 'needs_review', 'repairing', 'agent_error', 'unresolved', 'inconclusive', 'setup_error', 'verified']);

function send(res, status, value, type = 'application/json; charset=utf-8') {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  res.writeHead(status, {
    'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  });
  res.end(body);
}

async function jsonBody(req, max = 20_000) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (Buffer.byteLength(input) > max) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  try { return JSON.parse(input || '{}'); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').map((pair) => pair.trim().split(/=(.*)/s, 2)).filter(([name, value]) => name && value !== undefined).map(([name, value]) => [name, decodeURIComponent(value)]));
}

function signed(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET ?? 'local-session').update(data).digest('base64url');
  return `${data}.${signature}`;
}

function sessionFor(req) {
  if (!HOSTED) return { sub: 'local', email: '', name: 'Local user' };
  const token = cookies(req).patchloop_session;
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = createHmac('sha256', SESSION_SECRET).update(data).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

function user(req) { return sessionFor(req); }
function sameOrigin(req) {
  if (!HOSTED && !req.headers.origin) return true;
  const origin = req.headers.origin;
  if (!origin || !req.headers.host) return false;
  try {
    const parsed = new URL(origin);
    const expected = HOSTED ? new URL(PUBLIC_URL) : new URL(`http://${req.headers.host}`);
    return parsed.origin === expected.origin && parsed.host === req.headers.host;
  } catch { return false; }
}

function safeRun(run) {
  if (!run) return null;
  const { worktree, currentUrl, claimedBy, queueAction, ...publicRun } = run;
  return publicRun;
}

async function targetsFor(ownerId) {
  if (HOSTED && EXECUTION_MODE === 'worker') {
    const worker = await store.workerForOwner(ownerId);
    return worker.connected ? worker.targets : worker.targets.map((target) => ({ ...target, ready: false, requirements: 'Local runner is offline. Restart it to use this repository.' }));
  }
  return engine.listTargets();
}

async function startOAuth(res) {
  for (const [key, expiresAt] of pendingOAuth) if (expiresAt < Date.now()) pendingOAuth.delete(key);
  if (pendingOAuth.size >= 1000) throw Object.assign(new Error('Too many sign-in attempts are pending. Try again shortly.'), { status: 429 });
  const state = randomBytes(24).toString('base64url');
  pendingOAuth.set(state, Date.now() + 10 * 60_000);
  const redirectUri = `${new URL(PUBLIC_URL).origin}/auth/google/callback`;
  const query = new URLSearchParams({ client_id: GOOGLE_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.writeHead(302, { location: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, 'set-cookie': `patchloop_oauth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  res.end();
}

async function finishOAuth(req, res, url) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const cookieState = cookies(req).patchloop_oauth;
  const expiresAt = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  if (!state || state !== cookieState || !expiresAt || expiresAt < Date.now() || !code) throw Object.assign(new Error('Sign-in expired. Start again from PatchLoop.'), { status: 401 });
  const redirectUri = `${new URL(PUBLIC_URL).origin}/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) throw Object.assign(new Error('Google could not complete sign-in.'), { status: 401 });
  const token = await tokenResponse.json();
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) throw Object.assign(new Error('Google profile could not be verified.'), { status: 401 });
  const profile = await profileResponse.json();
  if (!profile.sub || profile.email_verified === false) throw Object.assign(new Error('Use a verified Google account.'), { status: 401 });
  const payload = { sub: profile.sub, email: profile.email ?? '', name: profile.name ?? '', exp: Date.now() + 7 * 24 * 60 * 60_000 };
  res.writeHead(302, { location: '/', 'set-cookie': [`patchloop_session=${signed(payload)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`, 'patchloop_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'], 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  res.end();
}

function workerToken(req) {
  const match = (req.headers.authorization ?? '').match(/^Bearer ([A-Za-z0-9_-]{40,100})$/);
  return match ? createHash('sha256').update(match[1]).digest('hex') : null;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, name: 'PatchLoop', version: '0.1.0', mode: HOSTED ? 'hosted' : 'local' });
  if (req.method === 'GET' && url.pathname === '/api/session') {
    const current = user(req);
    return send(res, 200, { mode: AUTH_MODE, authenticated: Boolean(current), authReady: !HOSTED || Boolean(GOOGLE_ID && GOOGLE_SECRET && SESSION_SECRET), executionEnabled: EXECUTION_MODE !== 'disabled', user: current ? { name: current.name, email: current.email } : null });
  }
  if (HOSTED && req.method === 'GET' && url.pathname === '/auth/google') return startOAuth(res);
  if (HOSTED && req.method === 'GET' && url.pathname === '/auth/google/callback') {
    try { return await finishOAuth(req, res, url); }
    catch (error) { return send(res, error.status ?? 401, `${error.message} <a href="/">Return to PatchLoop</a>`, 'text/html; charset=utf-8'); }
  }
  if (HOSTED && req.method === 'POST' && url.pathname === '/auth/logout') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request rejected.' });
    res.setHeader('set-cookie', 'patchloop_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (HOSTED && req.method === 'POST' && url.pathname === '/api/worker/exchange') {
    if (req.headers.origin && !sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request rejected.' });
    if (EXECUTION_MODE !== 'worker') return send(res, 503, { error: 'The local runner is disabled.' });
    for (const [key, pending] of pendingPairCodes) if (pending.expiresAt < Date.now()) pendingPairCodes.delete(key);
    if (pendingPairCodes.size > 1000) return send(res, 429, { error: 'Too many pairing attempts are pending. Try again shortly.' });
    const { code } = await jsonBody(req, 2000);
    const pending = typeof code === 'string' ? pendingPairCodes.get(code) : null;
    pendingPairCodes.delete(code);
    if (!pending || pending.expiresAt < Date.now()) return send(res, 401, { error: 'Pairing code is invalid or expired.' });
    const token = randomBytes(32).toString('base64url');
    await store.registerWorker(pending.ownerId, createHash('sha256').update(token).digest('hex'), []);
    return send(res, 200, { token, paired: true });
  }
  if (HOSTED && url.pathname.startsWith('/api/worker/') && url.pathname !== '/api/worker/exchange') {
    if (EXECUTION_MODE !== 'worker') return send(res, 503, { error: 'The local runner is disabled.' });
    const tokenHash = workerToken(req);
    if (!tokenHash || !await store.workerByTokenHash(tokenHash)) return send(res, 401, { error: 'A paired runner token is required.' });
    if (req.method === 'POST' && url.pathname === '/api/worker/targets') {
      const { targets } = await jsonBody(req, 20_000);
      if (!Array.isArray(targets) || targets.length > 20 || targets.some((target) => typeof target.id !== 'string' || typeof target.name !== 'string' || typeof target.ready !== 'boolean')) return send(res, 400, { error: 'A sanitized target list is required.' });
      return send(res, 200, { targets: await store.setTargets(tokenHash, targets.map(({ id, name, kind, ready, requirements }) => ({ id: id.slice(0, 80), name: name.slice(0, 100), kind: String(kind ?? 'local').slice(0, 24), ready, requirements: String(requirements ?? '').slice(0, 200) }))) });
    }
    if (req.method === 'GET' && url.pathname === '/api/worker/next') return send(res, 200, { job: await store.claimNext(tokenHash) });
    if (req.method === 'POST' && url.pathname === '/api/worker/heartbeat') {
      const body = await jsonBody(req, 2000);
      await store.heartbeat(tokenHash, Boolean(body.busy));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/worker/report') {
      const snapshot = await jsonBody(req, 1_600_000);
      if (typeof snapshot.lastDiff === 'string') snapshot.lastDiff = redact(snapshot.lastDiff).slice(0, 1_400_000);
      if (Array.isArray(snapshot.attempts)) for (const item of snapshot.attempts) if (typeof item.outputTail === 'string') item.outputTail = redact(item.outputTail).slice(-8000);
      if (Array.isArray(snapshot.events)) for (const item of snapshot.events) if (typeof item.message === 'string') item.message = redact(item.message).slice(0, 1600);
      return send(res, 200, { run: safeRun(await store.report(tokenHash, snapshot)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/worker/disconnect') {
      await store.disconnect(tokenHash);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Runner route not found.' });
  }

  const current = user(req);
  if (HOSTED && url.pathname.startsWith('/api/') && !['/api/health', '/api/session'].includes(url.pathname) && !current) return send(res, 401, { error: 'Sign in with Google to open your private workspace.' });

  if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request rejected.' });
  const ownerId = current?.sub ?? 'local';
  if (req.method === 'POST' && url.pathname === '/api/worker/pair') {
    if (!HOSTED || EXECUTION_MODE !== 'worker') return send(res, 503, { error: 'Runner pairing is not enabled.' });
    for (const [key, pending] of pendingPairCodes) if (pending.expiresAt < Date.now()) pendingPairCodes.delete(key);
    if (pendingPairCodes.size >= 1000) return send(res, 429, { error: 'Too many pairing attempts are pending. Try again shortly.' });
    const code = randomBytes(18).toString('base64url');
    pendingPairCodes.set(code, { ownerId, expiresAt: Date.now() + 10 * 60_000 });
    return send(res, 200, { code, expiresInSeconds: 600 });
  }
  if (req.method === 'GET' && url.pathname === '/api/preflight') {
    if (HOSTED) return send(res, 200, { hosted: true, executionEnabled: EXECUTION_MODE === 'worker', worker: await store.workerForOwner(ownerId) });
    return send(res, 200, await engine.preflight());
  }
  if (req.method === 'GET' && url.pathname === '/api/targets') return send(res, 200, { targets: await targetsFor(ownerId) });
  if (req.method === 'GET' && url.pathname === '/api/runs') return send(res, 200, { runs: (await store.list(ownerId)).map(safeRun) });
  if (req.method === 'POST' && url.pathname === '/api/runs') {
    const body = await jsonBody(req);
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
    const targetId = typeof body.targetId === 'string' ? body.targetId : '';
    if (task.length < 12 || task.length > 1600 || objective.length < 16 || objective.length > 1800) return send(res, 400, { error: 'Add a change request (12–1600 characters) and browser objective (16–1800 characters).' });
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(task + objective)) return send(res, 400, { error: 'Control characters are not allowed.' });
    if (EXECUTION_MODE === 'disabled') return send(res, 503, { error: 'Execution is disabled on this deployment.' });
    const targets = await targetsFor(ownerId);
    if (!targets.some((target) => target.id === targetId && target.ready)) return send(res, 400, { error: 'Choose a ready repository from the target picker.' });
    if (EXECUTION_MODE === 'local' && engine.busy) return send(res, 409, { error: 'The local runner is already processing a task.' });
    const run = await store.create({ ownerId, task, objective, targetId, queueAction: EXECUTION_MODE === 'worker' ? 'verify' : null });
    if (EXECUTION_MODE === 'local') void engine.runLocal(run.id, 'verify');
    return send(res, 202, { run: safeRun(run) });
  }
  const match = url.pathname.match(/^\/api\/runs\/([0-9a-f-]{36})(?:\/(verify|repair|diff))?$/i);
  if (match) {
    const [, id, action] = match;
    if (req.method === 'GET' && !action) {
      const run = await store.get(id, ownerId);
      return run ? send(res, 200, { run: safeRun(run) }) : send(res, 404, { error: 'Run not found.' });
    }
    if (req.method === 'GET' && action === 'diff') {
      const run = await store.get(id, ownerId);
      return run ? send(res, 200, run.lastDiff ?? '', 'text/x-diff; charset=utf-8') : send(res, 404, { error: 'Run not found.' });
    }
    if (req.method === 'POST' && ['verify', 'repair'].includes(action)) {
      const run = await store.get(id, ownerId);
      const allowed = action === 'verify' ? ['needs_review', 'unresolved', 'inconclusive', 'setup_error'] : ['needs_review', 'agent_error'];
      if (!run || !allowed.includes(run.state)) return send(res, 409, { error: 'This run cannot perform that action yet.' });
      if (action === 'repair') {
        const kane = run.attempts.filter((attempt) => attempt.kind === 'kane').slice(-2);
        const repeated = kane.length === 2 && kane.every((attempt) => attempt.verdict === 'failed' && attempt.objectiveHash === run.objectiveHash);
        if (run.repairCount >= 2 || (run.repairCount === 0 && !repeated)) return send(res, 409, { error: 'Replay the unchanged objective and confirm the same failure before sending it to Codex.' });
      }
      if (EXECUTION_MODE === 'worker') await store.enqueue(id, ownerId, action);
      else {
        if (engine.busy) return send(res, 409, { error: 'The local runner is already processing a task.' });
        if (action === 'verify') await store.update(id, ownerId, (item) => { item.state = 'queued'; });
        void engine.runLocal(id, action);
      }
      return send(res, 202, { accepted: true });
    }
  }

  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (relative.includes('..') || relative.includes('\\')) return send(res, 400, 'Invalid path.', 'text/plain; charset=utf-8');
    const filename = path.join(PUBLIC, relative);
    try {
      if (!(await stat(filename)).isFile()) return send(res, 404, 'Not found.', 'text/plain; charset=utf-8');
      const content = await readFile(filename);
      res.writeHead(200, { 'content-type': mime[path.extname(filename)] ?? 'application/octet-stream', 'content-length': content.length, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" });
      return res.end(content);
    } catch { return send(res, 404, 'Not found.', 'text/plain; charset=utf-8'); }
  }
  return send(res, 405, { error: 'Method not allowed.' });
}

createServer((req, res) => void route(req, res).catch((error) => {
  if (res.headersSent) return res.destroy();
  send(res, error.status ?? 500, { error: error.status ? error.message : 'PatchLoop could not complete that request.' });
  if (!error.status) process.stderr.write(`${redact(error.message)}\n`);
})).listen(PORT, HOST, () => process.stdout.write(`PatchLoop listening at http://${HOST}:${PORT}\n`));
