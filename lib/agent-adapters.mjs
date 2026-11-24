import os from 'node:os';
import path from 'node:path';
import { runProcess } from './process.mjs';

function globalEntry(packageName, executable, override) {
  if (override) return path.resolve(override);
  const npmGlobal = process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules')
    : path.join(process.env.NPM_CONFIG_PREFIX ?? '/usr/local', 'lib', 'node_modules');
  return path.join(npmGlobal, packageName, 'bin', executable);
}

const codexEntry = globalEntry('@openai/codex', 'codex.js', process.env.PATCHLOOP_CODEX_ENTRY);
const powershell = process.platform === 'win32'
  ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : null;

function runCli(command, args, options = {}) {
  if (process.platform !== 'win32') return runProcess(command, args, options);
  // npm-installed Windows CLIs commonly resolve to .cmd shims. Spawn a fixed
  // PowerShell command with argv passed as JSON in the environment so prompt
  // text is never interpolated into shell source.
  const script = "$ErrorActionPreference = 'Stop'; try { $agentArgs = ConvertFrom-Json -InputObject $env:PATCHLOOP_AGENT_ARGUMENTS; & $env:PATCHLOOP_AGENT_EXECUTABLE @agentArgs; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 127 }";
  return runProcess(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    ...options,
    env: {
      ...options.env,
      PATCHLOOP_AGENT_EXECUTABLE: command,
      PATCHLOOP_AGENT_ARGUMENTS: JSON.stringify(args),
    },
  });
}

export const AGENT_REGISTRY = Object.freeze([
  { id: 'codex', name: 'Codex', setup: 'Install Codex CLI and sign in with `codex login`.' },
  { id: 'claude-code', name: 'Claude Code', setup: 'Install Claude Code CLI and sign in locally.' },
  { id: 'cursor', name: 'Cursor CLI', setup: 'Install the Cursor CLI and sign in with `agent login`.' },
  { id: 'copilot', name: 'GitHub Copilot CLI', setup: 'Install Copilot CLI and sign in with `copilot login` or GitHub CLI.' },
  { id: 'kiro', name: 'Kiro CLI', setup: 'Install Kiro CLI and sign in locally.' },
  { id: 'mcp', name: 'Windsurf / custom MCP client', setup: 'Enable the PatchLoop MCP bridge on the runner and connect your IDE agent to its local stdio server.' },
]);

const definitions = {
  codex: {
    version: () => runProcess(process.execPath, [codexEntry, '--version'], { timeoutMs: 8_000, maxBytes: 4_000 }),
    auth: () => runProcess(process.execPath, [codexEntry, 'login', 'status'], { timeoutMs: 8_000, maxBytes: 4_000 }),
    execute: (prompt) => ({ command: process.execPath, args: [codexEntry, 'exec', '--json', '--ephemeral', '--color', 'never', '--approve-for-me', '--cd', '.', prompt] }),
  },
  'claude-code': {
    command: 'claude', versionArgs: ['--version'], authArgs: ['auth', 'status'],
    execute: (prompt) => ({ command: 'claude', args: ['-p', prompt, '--output-format', 'json', '--bare', '--tools', 'Read,Edit,Write'] }),
  },
  cursor: {
    command: 'agent', versionArgs: ['--version'], authArgs: ['status'],
    execute: (prompt) => ({ command: 'agent', args: ['-p', prompt, '--output-format', 'json'] }),
  },
  copilot: {
    command: 'copilot', versionArgs: ['--version'],
    auth: async () => process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN
      ? { code: 0, stdout: '' }
      : runCli('gh', ['auth', 'status'], { timeoutMs: 8_000, maxBytes: 4_000 }),
    execute: (prompt) => ({ command: 'copilot', args: ['-p', prompt, '--silent', '--output-format', 'json', '--assisted-approval', '--available-tools', 'read,write'] }),
  },
  kiro: {
    command: 'kiro-cli', versionArgs: ['--version'], authArgs: ['whoami'],
    execute: (prompt) => ({ command: 'kiro-cli', args: ['chat', '--v3', '--no-interactive', '--trust-tools', 'read_file,write_file,str_replace', '--output-format', 'stream-json', prompt] }),
  },
};

async function invoke(definition, action, timeoutMs = 8_000) {
  if (definition[action]) return definition[action]();
  const args = action === 'version' ? definition.versionArgs : definition.authArgs;
    return runCli(definition.command, args, { timeoutMs, maxBytes: 4_000 });
}

export async function probeAgents() {
  return Promise.all(AGENT_REGISTRY.map(async (agent) => {
    const definition = definitions[agent.id];
    if (agent.id === 'mcp') {
      const ready = process.env.PATCHLOOP_MCP_BRIDGE_ENABLED === 'true';
      return { ...agent, supported: true, installed: ready, authenticated: ready, ready, version: ready ? 'local stdio bridge' : null };
    }
    if (!definition) return { ...agent, supported: false, installed: false, authenticated: false, ready: false, version: null };
    const [version, auth] = await Promise.all([invoke(definition, 'version'), invoke(definition, 'auth')]);
    const installed = version.code === 0 && !version.timedOut;
    const authenticated = agent.id === 'copilot'
      ? Boolean(process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (auth.code === 0 && !auth.timedOut))
    : (agent.id === 'kiro'
        ? Boolean(process.env.KIRO_API_KEY && auth.code === 0 && !auth.timedOut)
        : (auth.code === 0 && !auth.timedOut && !(agent.id === 'codex' && /api[ -]?key/i.test(auth.stdout))));
    return {
      id: agent.id,
      name: agent.name,
      setup: agent.setup,
      supported: true,
      installed,
      authenticated,
      ready: installed && authenticated !== false,
      version: installed ? version.stdout.trim().slice(0, 80) : null,
    };
  }));
}

export async function runAgent(agentId, prompt, cwd, { timeoutMs = 240_000, maxBytes = 1_500_000 } = {}) {
  const definition = definitions[agentId];
  if (!definition || !AGENT_REGISTRY.some((item) => item.id === agentId && item.supported !== false)) throw new Error('The selected coding agent is not supported by this local runner.');
  const capability = (await probeAgents()).find((item) => item.id === agentId);
  if (!capability?.ready) throw new Error(`${capability?.name ?? 'Coding agent'} is not ready on this computer. ${capability?.setup ?? ''}`.trim());
  const invocation = buildAgentInvocation(agentId, prompt, cwd);
  return { result: await runCli(invocation.command, invocation.args, { cwd, timeoutMs, maxBytes, shell: false }), version: capability.version };
}

export function buildAgentInvocation(agentId, prompt, cwd) {
  const definition = definitions[agentId];
  if (!definition || !AGENT_REGISTRY.some((item) => item.id === agentId && item.supported !== false)) throw new Error('The selected coding agent is not supported by this local runner.');
  const invocation = definition.execute(prompt);
  if (agentId === 'codex') invocation.args[invocation.args.indexOf('--cd') + 1] = cwd;
  return invocation;
}

export function agentName(id) {
  return AGENT_REGISTRY.find((item) => item.id === id)?.name ?? 'Coding agent';
}

export function sanitizeAgentCapabilities(value) {
  const byId = new Map((Array.isArray(value) ? value : []).map((item) => [item?.id, item]));
  return AGENT_REGISTRY.map((agent) => {
    const item = byId.get(agent.id);
    const supported = agent.supported !== false;
    const ready = supported && Boolean(item?.ready && item?.installed);
    return {
      id: agent.id,
      name: agent.name,
      setup: agent.setup,
      supported,
      installed: supported && Boolean(item?.installed),
      authenticated: supported && typeof item?.authenticated === 'boolean' ? item.authenticated : null,
      ready,
      version: ready && typeof item?.version === 'string' ? item.version.replace(/[^A-Za-z0-9._+ -]/g, '').slice(0, 80) : null,
    };
  });
}

export function isAgentReady(agents, id) {
  return AGENT_REGISTRY.some((item) => item.id === id && item.supported !== false)
    && sanitizeAgentCapabilities(agents).some((item) => item.id === id && item.ready);
}
