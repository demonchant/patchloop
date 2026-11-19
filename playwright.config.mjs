import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.env.PATCHLOOP_TARGET_REPO ?? path.join(root, 'examples', 'patchloop-full-showcase2'));
const runData = path.join(root, '.patchloop', `e2e-${randomUUID()}`);
const quote = (value) => `"${value.replaceAll('"', '\\"')}"`;
const childEnv = Object.fromEntries(['PATH', 'Path', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4184', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `${quote(process.execPath)} ${quote(path.join(root, 'server.mjs'))}`,
      cwd: root,
      url: 'http://127.0.0.1:4184/api/health',
      timeout: 30_000,
      reuseExistingServer: false,
      env: { ...childEnv, PATCHLOOP_HOST: '127.0.0.1', PATCHLOOP_PORT: '4184', PATCHLOOP_DATA_DIR: path.join(runData, 'workbench'), PATCHLOOP_TARGET_REPO: target },
    },
    {
      command: `${quote(process.execPath)} ${quote(path.join(target, 'server.mjs'))}`,
      cwd: target,
      url: 'http://127.0.0.1:4185/api/health',
      timeout: 30_000,
      reuseExistingServer: false,
      env: { ...childEnv, PATCHLOOP_HOST: '127.0.0.1', PATCHLOOP_PORT: '4185', PORT: '4185', PATCHLOOP_DATA_DIR: path.join(runData, 'target') },
    },
  ],
});
