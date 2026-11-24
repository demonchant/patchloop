import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMcpRepair } from './mcp-bridge.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('MCP bridge exposes only run-bound context and records completion for independent checks', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-mcp-test-'));
  const runId = 'run-mcp-123';
  const worktree = path.join(dir, 'worktrees', runId);
  await mkdir(worktree, { recursive: true });
  const run = { id: runId, task: 'Fix the restore behavior', objective: 'Restore a completed task and keep its checkmark.', objectiveHash: 'fixed-hash', worktree };
  const repair = runMcpRepair(dir, run, 'Kane observed an unchecked restored task.', 10_000);
  const child = spawn(process.execPath, [path.join(repo, 'mcp-server.mjs')], {
    cwd: repo,
    env: { ...process.env, PATCHLOOP_DATA_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let nextId = 0;
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      const waiting = pending.get(message.id);
      if (waiting) { pending.delete(message.id); waiting.resolve(message); }
    } catch {}
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out waiting for MCP ${method}`)); }, 5000);
    pending.get(id).resolve = (value) => { clearTimeout(timer); resolve(value); };
  });
  try {
    const initialize = await request('initialize', { protocolVersion: '2025-11-25' });
    assert.equal(initialize.result.serverInfo.name, 'patchloop-local-repair');
    const listed = await request('tools/list');
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['patchloop_get_repair_context', 'patchloop_finish_repair']);
    const context = await request('tools/call', { name: 'patchloop_get_repair_context', arguments: {} });
    const parsed = JSON.parse(context.result.content[0].text);
    assert.equal(parsed.runId, runId);
    assert.equal(parsed.objectiveHash, 'fixed-hash');
    assert.equal(parsed.worktree, worktree);
    assert.match(parsed.kaneFailure, /unchecked restored task/);
    assert.equal(Object.hasOwn(parsed, 'command'), false);
    const finished = await request('tools/call', { name: 'patchloop_finish_repair', arguments: { runId, summary: 'Updated the restore handler.' } });
    assert.match(finished.result.content[0].text, /PatchLoop will check the diff/);
    const result = await repair;
    assert.equal(result.result.code, 0);
    assert.equal(result.result.stdout, 'Updated the restore handler.');
    await assert.rejects(readFile(path.join(dir, 'mcp-bridge', 'active.json')), { code: 'ENOENT' });
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    lines.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('MCP bridge refuses a worktree outside the run-specific worker directory', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-mcp-path-test-'));
  try {
    await assert.rejects(runMcpRepair(dir, { id: 'run-1', worktree: path.join(dir, 'elsewhere') }, 'failure', 100), /outside this run/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
