import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKaneOutput, redact, runProcess, sha256 } from './process.mjs';

test('objective hashes are stable SHA-256 values', () => {
  assert.equal(sha256('same objective'), sha256('same objective'));
  assert.notEqual(sha256('same objective'), sha256('different objective'));
  assert.equal(sha256('same objective').length, 64);
});

test('Kane parsing accepts a passed run_end only', () => {
  const output = [
    '{"type":"stream_start","surface":"run"}',
    'progress line that should be ignored',
    '{"type":"run_end","status":"passed","result_code":100}',
  ].join('\n');
  const result = parseKaneOutput(output);
  assert.equal(result.passed, true);
  assert.equal(result.malformed, 1);
});

test('Kane parsing fails closed for missing, failed, or contradictory final events', () => {
  assert.equal(parseKaneOutput('{"type":"stream_start"}').passed, false);
  assert.equal(parseKaneOutput('{"type":"run_end","status":"failed"}').passed, false);
  assert.equal(parseKaneOutput('{"type":"run_end","status":"passed","result_code":740}').passed, false);
  assert.equal(parseKaneOutput('{"type":"run_end","status":"passed"}\n{"type":"warning"}').passed, false);
});

test('redaction removes provider tokens and signed URLs', () => {
  const value = redact('testmu_abcdefghijklmnopqrstuvwxyz https://example.test/run?signature=very-secret');
  assert.equal(value.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(value.includes('very-secret'), false);
});

test('process output overflow is reported even after a pass event was emitted', async () => {
  const script = "process.stdout.write(JSON.stringify({type:'run_end',status:'passed'})+'\\n'); setTimeout(() => process.stdout.write('x'.repeat(10000)), 20);";
  const result = await runProcess(process.execPath, ['-e', script], { maxBytes: 100, timeoutMs: 3000, env: process.env });
  assert.equal(result.overflow, true);
  assert.equal(parseKaneOutput(result.stdout).passed, true);
});
