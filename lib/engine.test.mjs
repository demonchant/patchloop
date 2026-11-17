import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Engine } from './engine.mjs';
import { Store } from './store.mjs';

test('engine claims its process lock before awaiting store access', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-engine-'));
  try {
    const engine = new Engine(new Store(path.join(dir, 'state.json')));
    const first = engine.startVerification('missing-run');
    await assert.rejects(engine.startVerification('another-run'), /Another run is active/);
    await assert.rejects(first, /Run not found/);
    assert.equal(engine.busy, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('startup turns interrupted verification and repair into retryable honest states', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-recovery-'));
  try {
    const store = new Store(path.join(dir, 'state.json'));
    const verifying = await store.create({ task: 'verify task', objective: 'check the expected browser behavior', objectiveHash: 'a'.repeat(64) });
    const repairing = await store.create({ task: 'repair task', objective: 'check the expected browser behavior', objectiveHash: 'b'.repeat(64) });
    await store.update(verifying.id, (run) => { run.state = 'verifying'; run.currentUrl = 'http://127.0.0.1:4999'; });
    await store.update(repairing.id, (run) => { run.state = 'repairing'; });

    await new Engine(store).recoverInterrupted();

    const recoveredVerification = await store.get(verifying.id);
    const recoveredRepair = await store.get(repairing.id);
    assert.equal(recoveredVerification.state, 'inconclusive');
    assert.equal(recoveredVerification.currentUrl, null);
    assert.equal(recoveredVerification.events.at(-1).type, 'process_interrupted');
    assert.equal(recoveredRepair.state, 'agent_error');
    assert.equal(recoveredRepair.events.at(-1).type, 'process_interrupted');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
