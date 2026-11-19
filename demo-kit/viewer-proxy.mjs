import { createServer } from 'node:http';
import { viewerRoute } from '../lib/viewer-routes.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PATCHLOOP_VIEWER_PORT ?? 4299);
const UPSTREAM = `http://127.0.0.1:${Number(process.env.PATCHLOOP_VIEWER_UPSTREAM_PORT ?? 4173)}`;
const MAX_RESPONSE_BYTES = 2_000_000;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  });
  res.end(data);
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const route = viewerRoute(pathname, req.method);
  if (!route) return send(res, 403, { error: 'Read-only demo access.' });
  if (route.kind === 'health') return send(res, 200, { ok: true });
  if (route.kind === 'preflight') return send(res, 200, { remoteViewer: true });

  try {
    const incoming = new URL(req.url, 'http://127.0.0.1');
    const upstreamUrl = new URL(`${incoming.pathname}${incoming.search}`, UPSTREAM);
    const response = await fetch(upstreamUrl, { method: 'GET', signal: AbortSignal.timeout(8_000), redirect: 'error' });
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) return send(res, 502, { error: 'Demo response is too large.' });
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        return send(res, 502, { error: 'Demo response is too large.' });
      }
      chunks.push(Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks, size);
    const headers = {};
    for (const key of ['content-type', 'x-content-type-options', 'referrer-policy', 'content-security-policy']) {
      const value = response.headers.get(key);
      if (value) headers[key] = value;
    }
    headers['content-length'] = data.length;
    headers['cache-control'] = 'no-store';
    res.writeHead(response.status, headers);
    res.end(data);
  } catch {
    send(res, 502, { error: 'The local demo is temporarily unavailable.' });
  }
});

server.listen(PORT, HOST, () => process.stdout.write(`Read-only viewer proxy at http://${HOST}:${PORT}\n`));
