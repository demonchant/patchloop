import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRun } from './repeatability.mjs';

const hash = 'a'.repeat(64);
const failed = (objectiveHash = hash) => ({ kind: 'kane', objectiveHash, verdict: 'failed' });

test('repair gate opens only after two consecutive failures with the same objective', () => {
  assert.equal(classifyRun([failed()], 'failed', hash, 0).repeatedFailure, false);
  assert.equal(classifyRun([failed(), failed('b'.repeat(64))], 'failed', hash, 0).repeatedFailure, false);
  assert.equal(classifyRun([failed(), failed()], 'failed', hash, 0).repeatedFailure, true);
});

test('contradictory Kane outcomes stay inconclusive before repair', () => {
  assert.equal(classifyRun([failed()], 'passed', hash, 0).conflict, true);
});
