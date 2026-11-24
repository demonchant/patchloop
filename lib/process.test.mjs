import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashText, parseNdjson, redact } from './process.mjs';
import { evaluateRepeatability } from './repeatability.mjs';
import { canRetryCodexArgumentFailure } from './agent-retry.mjs';
import { Store } from './store.mjs';

test('acceptance objective hashing is stable and content-sensitive', () => {
  assert.equal(hashText('same objective'), hashText('same objective'));
  assert.notEqual(hashText('first objective'), hashText('second objective'));
});

test('Kane parser requires a final run_end event and successful code', () => {
  const passed = parseNdjson(`${JSON.stringify({ type: 'step', status: 'ok' })}\n${JSON.stringify({ type: 'run_end', status: 'passed', result_code: 100 })}`);
  assert.equal(passed.passed, true);
  assert.equal(passed.resultCode, 100);
  assert.equal(parseNdjson('{"type":"run_end","status":"failed","result_code":710}').passed, false);
  assert.equal(parseNdjson('{"type":"step"}').passed, false);
  assert.equal(parseNdjson('not json').malformedCount, 1);
});

test('redactor removes credential-shaped strings and signed query URLs', () => {
  assert.doesNotMatch(redact('access-key=abc123456789abcdef'), /abc123456789abcdef/);
  assert.doesNotMatch(redact('https://example.invalid/run?token=secret-value'), /secret-value/);
  assert.doesNotMatch(redact('https://test-manager.lambdatest.com/projects/abc/test-cases/def/dashboard/share/US_123456789012345678901234?type=summary'), /US_123456789012345678901234/);
});

test('first failure requires exact replay before Codex repair; conflicting replay is inconclusive', () => {
  const hash = hashText('fixed objective');
  const first = evaluateRepeatability([], 'failed', hash, 0);
  assert.equal(first.actionable, false);
  assert.equal(first.label, 'single_failure_needs_replay');
  const repeated = evaluateRepeatability([{ kind: 'kane', verdict: 'failed', objectiveHash: hash }], 'failed', hash, 0);
  assert.equal(repeated.actionable, true);
  assert.equal(repeated.label, 'failure_reproduced');
  const mismatch = evaluateRepeatability([{ kind: 'kane', verdict: 'failed', objectiveHash: hash }], 'passed', hash, 0);
  assert.equal(mismatch.inconsistent, true);
  const afterRepair = evaluateRepeatability([{ kind: 'agent', changed: true }], 'passed', hash, 1);
  assert.equal(afterRepair.inconsistent, false);
});

test('allows one extra Codex retry for repeated Windows CLI argument parsing failures only', () => {
  const failure = { kind: 'agent', providerId: 'codex', exitCode: 2, outputTail: "error: unexpected argument 'available:' found" };
  assert.equal(canRetryCodexArgumentFailure([failure]), true);
  assert.equal(canRetryCodexArgumentFailure([failure, failure]), true);
  assert.equal(canRetryCodexArgumentFailure([failure, failure, failure]), false);
  assert.equal(canRetryCodexArgumentFailure([{ ...failure, providerId: 'cursor' }]), false);
  assert.equal(canRetryCodexArgumentFailure([{ ...failure, exitCode: 0 }]), false);
});

test('run history survives store reconstruction and objective hash remains attached', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-store-'));
  try {
    const file = path.join(dir, 'state.json');
    const first = new Store(file);
    const objective = 'Verify a task persists after a reload.';
    const run = await first.create({ task: 'Persist a task after reload', objective, objectiveHash: hashText(objective) });
    await first.update(run.id, (record) => { record.state = 'needs_review'; record.attempts.push({ id: 'verify-1', kind: 'kane', verdict: 'failed', objectiveHash: record.objectiveHash }); });
    const restarted = new Store(file);
    const saved = await restarted.get(run.id);
    assert.equal(saved.state, 'needs_review');
    assert.equal(saved.objectiveHash, hashText(objective));
    assert.equal(saved.attempts.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('worker repository catalogs omit local paths and task targets cannot change during reports', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-target-store-'));
  try {
    const store = new Store(path.join(dir, 'state.json'));
    const tokenHash = 'worker-token-hash';
    await store.registerWorker('owner-a', tokenHash);
    const targets = await store.setWorkerTargets(tokenHash, [{
      id: 'configured', name: 'Showcase', kind: 'local', ready: true,
      requirements: 'Committed Git repo at C:\\private\\showcase', path: 'C:\\private\\showcase', error: 'C:\\private\\failure',
    }]);
    assert.deepEqual(targets, [{ id: 'configured', name: 'Showcase', kind: 'local', ready: true, requirements: 'Committed Git repo at [local path]' }]);
    assert.deepEqual(await store.workerTargets('owner-a'), targets);

    const run = await store.create({ task: 'Keep target selection fixed', objective: 'Confirm the selected target remains fixed.', objectiveHash: hashText('Confirm the selected target remains fixed.'), targetId: 'configured', ownerId: 'owner-a' });
    await store.update(run.id, (record) => { record.workerAction = 'verify'; });
    const claimed = await store.claimWorkerRun(tokenHash);
    assert.equal(claimed.targetId, 'configured');
    await assert.rejects(store.reportWorkerRun(tokenHash, { ...claimed, targetId: 'bundled-demo', state: 'verifying', events: [], attempts: [] }), /target selection/);
    await assert.rejects(store.reportWorkerRun(tokenHash, { ...claimed, agentId: 'cursor', state: 'verifying', events: [], attempts: [] }), /selected coding agent/);
    await assert.rejects(store.reportWorkerRun(tokenHash, { ...claimed, state: 'verifying', events: [], attempts: [{ kind: 'agent', providerId: 'cursor' }] }), /provider recorded/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('worker recovers a completed report after heartbeat loss, but rejects it after a newer claim', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-worker-recovery-'));
  try {
    const file = path.join(dir, 'state.json');
    const store = new Store(file);
    const tokenHash = 'worker-recovery-token';
    await store.registerWorker('owner-a', tokenHash);
    const objective = 'Restore completed task status.';
    const run = await store.create({ task: 'Repair task restoration', objective, objectiveHash: hashText(objective), ownerId: 'owner-a' });
    await store.update(run.id, (record) => { record.workerAction = 'repair'; record.state = 'queued'; });
    const claimed = await store.claimWorkerRun(tokenHash);
    const startedAt = new Date(Date.now() + 1).toISOString();
    const completedAt = new Date(Date.now() + 2).toISOString();
    const finishedSnapshot = {
      ...claimed,
      state: 'agent_error',
      repairCount: 1,
      events: [...claimed.events,
        { at: startedAt, type: 'repair_started', message: 'Repair started.' },
        { at: completedAt, type: 'repair_finished', message: 'Repair completed with a diff.' }],
      attempts: [{ id: 'agent-1', kind: 'agent', providerId: 'codex', startedAt, completedAt, exitCode: 2, changed: true, outputTail: 'saved diff' }],
      lastDiff: 'diff --git a/server.mjs b/server.mjs',
      diffStat: 'server.mjs | 1 +',
    };

    const saved = JSON.parse(await readFile(file, 'utf8'));
    saved.workers[0].busyRunId = null;
    const serverRun = saved.runs.find((item) => item.id === run.id);
    serverRun.state = 'agent_error';
    serverRun.events.push({ at: new Date().toISOString(), type: 'worker_lost', message: 'Runner heartbeat expired.' });
    await writeFile(file, JSON.stringify(saved));

    const recovered = await store.reportWorkerRun(tokenHash, finishedSnapshot);
    assert.equal(recovered.state, 'agent_error');
    assert.equal(recovered.lastDiff, finishedSnapshot.lastDiff);
    assert.equal(recovered.attempts.at(-1).outputTail, 'saved diff');
    assert.ok(recovered.events.some((event) => event.type === 'worker_report_recovered'));

    await store.update(run.id, (record) => {
      record.state = 'queued';
      record.workerAction = 'repair';
      record.events.push({ at: new Date().toISOString(), type: 'repair_queued', message: 'Retry queued.' });
    });
    const newerClaim = await store.claimWorkerRun(tokenHash);
    assert.notEqual(newerClaim.workerLeaseId, finishedSnapshot.workerLeaseId);
    await assert.rejects(store.reportWorkerRun(tokenHash, finishedSnapshot), /older runner assignment/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
