const RUN_ID = '[0-9a-f-]{36}';

export function viewerRoute(pathname, method) {
  if (method !== 'GET') return null;
  if (pathname === '/__viewer_health') return { kind: 'health' };
  if (pathname === '/api/preflight') return { kind: 'preflight' };
  if (['/', '/app.js', '/styles.css', '/api/health', '/api/runs'].includes(pathname)) return { kind: 'upstream' };
  if (new RegExp(`^/api/runs/${RUN_ID}$`, 'i').test(pathname)) return { kind: 'upstream' };
  if (new RegExp(`^/api/runs/${RUN_ID}/diff$`, 'i').test(pathname)) return { kind: 'upstream' };
  return null;
}
