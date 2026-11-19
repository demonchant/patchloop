import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

export function redact(value = '') {
  return String(value)
    .replace(/(?:sk|pk|ghp|gho|github_pat|testmu)[-_][A-Za-z0-9_-]{12,}/gi, '[REDACTED]')
    .replace(/(access[-_ ]?key\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]*(?:token|signature|secret)=[^\s"'<>]*/gi, '[REDACTED_URL]')
    .slice(-12_000);
}

export function parseKaneOutput(text) {
  const events = [];
  let malformed = 0;
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') events.push(parsed);
    } catch { malformed += 1; }
  }
  const last = events.at(-1) ?? null;
  const final = (last?.type ?? last?.event) === 'run_end' ? last : null;
  const resultCode = final?.result_code ?? final?.resultCode ?? final?.code ?? null;
  const status = String(final?.status ?? final?.result?.status ?? '').toLowerCase();
  const passed = Boolean(final) && ['pass', 'passed'].includes(status) && resultCode !== 740 && resultCode !== '740';
  return { events, final, resultCode, status, passed, malformed };
}

export function runProcess(command, args, { cwd, env, timeoutMs = 180_000, maxBytes = 1_500_000, onLine } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env: env ?? process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, spawnError: redact(error.message), stdout: '', stderr: '' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let size = 0;
    let timedOut = false;
    let overflow = false;
    let settled = false;
    let pending = '';
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500).unref();
    }, timeoutMs);
    const collect = (isOut) => (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true;
        child.kill('SIGTERM');
        return;
      }
      const value = chunk.toString('utf8');
      if (isOut) {
        stdout += value;
        if (onLine) {
          pending += value;
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? '';
          for (const line of lines) if (line.trim()) onLine(line);
        }
      } else stderr += value;
    };
    child.stdout.on('data', collect(true));
    child.stderr.on('data', collect(false));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, spawnError: redact(error.message), stdout: redact(stdout), stderr: redact(stderr), timedOut, overflow });
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pending.trim() && onLine) onLine(pending);
      resolve({ code, signal, stdout: redact(stdout), stderr: redact(stderr), timedOut, overflow });
    });
  });
}
