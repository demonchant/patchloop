import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('capability sanitization exposes only registered provider metadata', async () => {
  const { AGENT_REGISTRY, sanitizeAgentCapabilities, isAgentReady } = await import('./agent-adapters.mjs');
  const input = [
    { id: 'codex', name: 'Attacker supplied label', installed: true, authenticated: true, ready: true, version: 'codex 1.2.3', email: 'private@example.com', token: 'secret' },
    { id: 'unexpected-cli', installed: true, authenticated: true, ready: true, command: 'arbitrary.exe' },
  ];
  const result = sanitizeAgentCapabilities(input);
  assert.deepEqual(result.map((agent) => agent.id), AGENT_REGISTRY.map((agent) => agent.id));
  assert.equal(result[0].name, 'Codex');
  assert.equal(result[0].version, 'codex 1.2.3');
  assert.equal(JSON.stringify(result).includes('private@example.com'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('arbitrary.exe'), false);
  assert.equal(isAgentReady(result, 'codex'), true);
  assert.equal(isAgentReady(result, 'unexpected-cli'), false);
  assert.equal(isAgentReady(result, 'claude-code'), false);
});

test('provider invocation builders use fixed CLIs and bounded permission flags', async () => {
  const { buildAgentInvocation } = await import('./agent-adapters.mjs');
  const prompt = 'Review this observed browser failure; do not alter the objective.';
  const cwd = 'C:\\patchloop\\worktree';
  const codex = buildAgentInvocation('codex', prompt, cwd);
  assert.equal(codex.command, process.execPath);
  assert.ok(codex.args.includes('--ephemeral'));
  assert.ok(codex.args.includes('--approve-for-me'));
  assert.equal(codex.args[codex.args.indexOf('--cd') + 1], cwd);
  const claude = buildAgentInvocation('claude-code', prompt, cwd);
  assert.equal(claude.command, 'claude');
  assert.deepEqual(claude.args.slice(-3), ['--bare', '--tools', 'Read,Edit,Write']);
  assert.equal(claude.args.includes('--dangerously-skip-permissions'), false);
  const cursor = buildAgentInvocation('cursor', prompt, cwd);
  assert.equal(cursor.command, 'agent');
  assert.ok(cursor.args.includes('--output-format') && cursor.args.includes('json'));
  const copilot = buildAgentInvocation('copilot', prompt, cwd);
  assert.equal(copilot.command, 'copilot');
  assert.ok(copilot.args.includes('--assisted-approval'));
  assert.equal(copilot.args.includes('--allow-all-tools'), false);
  const kiro = buildAgentInvocation('kiro', prompt, cwd);
  assert.equal(kiro.command, 'kiro-cli');
  assert.ok(kiro.args.includes('--no-interactive'));
  assert.equal(kiro.args.includes('--trust-all-tools'), false);
  assert.throws(() => buildAgentInvocation('mcp', prompt, cwd), /not supported/);
});

test('Codex adapter invokes only its fixed entry and captures provider version and exit', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patchloop-fake-codex-'));
  const oldEntry = process.env.PATCHLOOP_CODEX_ENTRY;
  const oldPath = process.env.PATH;
  const entry = path.join(dir, 'codex.mjs');
  const cwd = path.join(dir, 'target');
  await mkdir(cwd);
  await writeFile(entry, [
    "const args = process.argv.slice(2);",
    "if (args[0] === '--version') { console.log('codex-test 1.0'); process.exit(0); }",
    "if (args[0] === 'login' && args[1] === 'status') { console.log('Logged in'); process.exit(0); }",
    "if (args[0] === 'exec') { console.log(JSON.stringify({ cwd: process.cwd(), prompt: args.at(-1), noTty: args.includes('--ephemeral') })); process.exit(0); }",
    'process.exit(9);',
  ].join('\n'));
  process.env.PATCHLOOP_CODEX_ENTRY = entry;
  process.env.PATH = dir;
  try {
    const adapters = await import(`./agent-adapters.mjs?test=${Date.now()}`);
    const { result, version } = await adapters.runAgent('codex', 'inspect and repair this task', cwd, { timeoutMs: 10_000 });
    assert.equal(version, 'codex-test 1.0');
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.cwd, cwd);
    assert.equal(output.prompt, 'inspect and repair this task');
    assert.equal(output.noTty, true);
    await assert.rejects(adapters.runAgent('unexpected-cli', 'prompt', cwd), /not supported/);
  } finally {
    if (oldEntry === undefined) delete process.env.PATCHLOOP_CODEX_ENTRY;
    else process.env.PATCHLOOP_CODEX_ENTRY = oldEntry;
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
