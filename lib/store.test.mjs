import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  return { store: new Store(file), file };
}

test('store persists state and keeps runs scoped to their owner', async (t) => {
  const { store, file } = await fixture(t);
  const run = await store.create({ ownerId: 'alice', task: 'Repair the restore behavior', objective: 'Create, archive and restore a task', targetId: 'repo' });
  assert.equal((await store.get(run.id, 'bob')), null);
  assert.equal((await new Store(file).get(run.id, 'alice')).objectiveHash, run.objectiveHash);
});

test('worker claims are exclusive and a verified report needs a passing Kane event', async (t) => {
  const { store } = await fixture(t);
  const tokenHash = 'd'.repeat(64);
  await store.registerWorker('alice', tokenHash, [{ id: 'repo', name: 'Repo', ready: true }]);
  const run = await store.create({ ownerId: 'alice', task: 'Repair the restore behavior', objective: 'Create, archive and restore a task', targetId: 'repo', queueAction: 'verify' });
  const claim = await store.claimNext(tokenHash);
  assert.equal(claim.run.id, run.id);
  assert.equal(claim.action, 'verify');
  assert.equal(await store.claimNext(tokenHash), null);
  const report = { id: run.id, task: run.task, objective: run.objective, objectiveHash: run.objectiveHash, targetId: run.targetId, state: 'verified', repairCount: 0, attempts: [], events: [], lastDiff: '', diffStat: '' };
  await assert.rejects(store.report(tokenHash, report), /successful final Kane event/);
  report.attempts = [{ id: 'kane-1', kind: 'kane', objectiveHash: run.objectiveHash, exitCode: 0, verdict: 'passed', finalEvent: '{"type":"run_end","status":"passed"}', outputTail: '' }];
  report.events = [{ at: new Date().toISOString(), type: 'verification_finished', message: 'Kane finished.' }];
  const saved = await store.report(tokenHash, report);
  assert.equal(saved.state, 'verified');
  assert.equal((await store.workerForOwner('alice')).busy, false);
});
