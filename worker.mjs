import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './lib/engine.mjs';
import { Store } from './lib/store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.env.PATCHLOOP_DATA_DIR ?? path.join(ROOT, '.patchloop'));
const CONFIG_DIR = path.join(DATA, 'runner');
const CONFIG_FILE = path.join(CONFIG_DIR, 'token.json');
const store = new Store(path.join(DATA, 'runner-state.json'));
const engine = new Engine(store);

function argsFor(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') result.url = argv[++i];
    else if (argv[i] === '--pair-code') result.pairCode = argv[++i];
    else if (argv[i] === '--disconnect') result.disconnect = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return result;
}

const options = argsFor(process.argv.slice(2));
if (!options.url || !/^https?:\/\//.test(options.url)) throw new Error('Usage: npm run worker -- --url https://your-patchloop-host [--pair-code CODE] [--disconnect]');
const base = new URL(options.url);
if (base.username || base.password) throw new Error('Runner URL cannot include credentials.');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(base.hostname))) throw new Error('Use HTTPS for remote PatchLoop sites. Plain HTTP is allowed only on loopback.');
base.pathname = base.pathname.replace(/\/$/, '');

async function request(endpoint, { token, method = 'GET', body } = {}) {
  const response = await fetch(new URL(endpoint, base), { method, redirect: 'error', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const value = await response.text();
  let data;
  try { data = value ? JSON.parse(value) : {}; } catch { data = { error: value }; }
  if (!response.ok) throw new Error(data.error ?? `Runner request failed (${response.status}).`);
  return data;
}

await mkdir(CONFIG_DIR, { recursive: true });
let token;
if (options.disconnect) {
  try { token = JSON.parse(await readFile(CONFIG_FILE, 'utf8')).token; } catch { token = null; }
  if (token) await request('/api/worker/disconnect', { token, method: 'POST', body: {} });
  await unlink(CONFIG_FILE).catch(() => {});
  process.stdout.write('Local runner disconnected and saved pairing removed.\n');
  process.exit(0);
}

if (options.pairCode) {
  const result = await request('/api/worker/exchange', { method: 'POST', body: { code: options.pairCode } });
  token = result.token;
  await writeFile(CONFIG_FILE, `${JSON.stringify({ token, site: base.origin, pairedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
} else {
  try {
    const saved = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    if (saved.site !== base.origin) throw new Error('Saved runner token belongs to a different PatchLoop site.');
    token = saved.token;
  } catch { throw new Error('No saved pairing. Connect the runner from the hosted PatchLoop page first.'); }
}

const targets = await engine.listTargets();
await request('/api/worker/targets', { token, method: 'POST', body: { targets } });
process.stdout.write(`Runner connected to ${base.origin}; ${targets.filter((target) => target.ready).length} ready repository target(s). Keep this process open.\n`);

let stopped = false;
let active = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });

while (!stopped) {
  try {
    const result = await request('/api/worker/next', { token });
    if (result.job) {
      active = true;
      const { run, action } = result.job;
      process.stdout.write(`${action === 'repair' ? 'Repair' : 'Verification'} accepted for task ${run.id.slice(0, 8)}.\n`);
      await request('/api/worker/heartbeat', { token, method: 'POST', body: { busy: true } });
      const heartbeat = setInterval(() => { void request('/api/worker/heartbeat', { token, method: 'POST', body: { busy: true } }).catch((error) => process.stderr.write(`Runner heartbeat issue: ${error.message}\n`)); }, 15_000);
      let completed;
      try { completed = await engine.runAction(run, action); }
      finally { clearInterval(heartbeat); }
      await request('/api/worker/report', { token, method: 'POST', body: {
        id: completed.id, task: completed.task, objective: completed.objective, objectiveHash: completed.objectiveHash, targetId: completed.targetId,
        state: completed.state, repairCount: completed.repairCount, attempts: completed.attempts, events: completed.events,
        lastDiff: completed.lastDiff, diffStat: completed.diffStat,
      } });
      process.stdout.write(`Task ${run.id.slice(0, 8)} reported as ${completed.state}.\n`);
      await request('/api/worker/heartbeat', { token, method: 'POST', body: { busy: false } });
      active = false;
      continue;
    }
  } catch (error) {
    process.stderr.write(`Runner connection issue: ${error.message}\n`);
    if (active) active = false;
  }
  await new Promise((resolve) => setTimeout(resolve, active ? 1500 : 2200));
}
process.stdout.write('Local runner stopped.\n');
