import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.mjs';

test('runner keeps one isolated worktree through repeat, repair, and same-objective verification', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-engine-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'target');
  const state = path.join(dir, 'state');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'server.mjs'), `import { createServer } from 'node:http';\nconst server = createServer((req, res) => {\n  if (req.url === '/api/health') { res.writeHead(200).end('ok'); return; }\n  if (req.url === '/api/restore') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ completed: false, secretPresent: Boolean(process.env.PATCHLOOP_SENTINEL) })); return; }\n  res.writeHead(404).end();\n});\nserver.listen(Number(process.env.PATCHLOOP_PORT), '127.0.0.1');\n`);
  execFileSync('git', ['init', '-b', 'main'], { cwd: target, stdio: 'ignore' });
  execFileSync('git', ['add', 'server.mjs'], { cwd: target, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=PatchLoop Test', '-c', 'user.email=patchloop-test@invalid', 'commit', '-m', 'seed'], { cwd: target, stdio: 'ignore' });

  const kane = path.join(dir, 'fake-kane.cjs');
  const codex = path.join(dir, 'fake-codex.cjs');
  await writeFile(kane, `(async () => {\nconst base = process.argv[process.argv.indexOf('--url') + 1];\nconst result = await fetch(new URL('/api/restore', base)).then((response) => response.json());\nconst passed = result.completed && !result.secretPresent;\nprocess.stdout.write(JSON.stringify({ type: 'run_end', status: passed ? 'passed' : 'failed' }) + '\\n');\nif (!passed) process.exitCode = 1;\n})().catch((error) => { console.error(error); process.exitCode = 1; });\n`);
  await writeFile(codex, `const fs = require('node:fs');\nconst root = process.argv[process.argv.indexOf('--cd') + 1];\nconst file = root + '/server.mjs';\nconst source = fs.readFileSync(file, 'utf8');\nif (!source.includes('completed: false')) process.exit(2);\nfs.writeFileSync(file, source.replace('completed: false', 'completed: true'));\n`);

  const envKeys = ['PATCHLOOP_DATA_DIR', 'PATCHLOOP_TARGET_REPO', 'PATCHLOOP_KANE_ENTRY', 'PATCHLOOP_CODEX_ENTRY', 'PATCHLOOP_SENTINEL'];
  const priorEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { PATCHLOOP_DATA_DIR: state, PATCHLOOP_TARGET_REPO: target, PATCHLOOP_KANE_ENTRY: kane, PATCHLOOP_CODEX_ENTRY: codex, PATCHLOOP_SENTINEL: 'must-not-reach-target' });
  t.after(() => { for (const key of envKeys) priorEnv[key] === undefined ? delete process.env[key] : process.env[key] = priorEnv[key]; });

  const { Engine } = await import(`./engine.mjs?fixture=${Date.now()}`);
  const store = new Store(path.join(state, 'state.json'));
  const engine = new Engine(store);
  const run = await store.create({ ownerId: 'local', task: 'Preserve completed status on restore', objective: 'Restore the completed task and keep it checked', targetId: 'configured' });

  const first = await engine.runLocal(run.id, 'verify');
  assert.equal(first.state, 'needs_review');
  const second = await engine.runLocal(run.id, 'verify');
  assert.equal(second.state, 'needs_review');
  assert.equal(second.attempts[1].objectiveHash, run.objectiveHash);
  const repair = await engine.runLocal(run.id, 'repair');
  assert.equal(repair.state, 'unresolved');
  assert.equal(repair.attempts.at(-1).changed, true);
  const verified = await engine.runLocal(run.id, 'verify');
  assert.equal(verified.state, 'verified');
  assert.deepEqual(verified.attempts.filter((attempt) => attempt.kind === 'kane').map((attempt) => attempt.objectiveHash), [run.objectiveHash, run.objectiveHash, run.objectiveHash]);
  assert.match(verified.lastDiff, /completed: true/);
  assert.equal(await readFile(path.join(target, 'server.mjs'), 'utf8').then((source) => source.includes('completed: false')), true);
});
