import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

export async function runMcpRepair(dataDir, run, kaneFailure, timeoutMs = 240_000) {
  const expectedWorktree = path.resolve(dataDir, 'worktrees', run.id);
  if (!run.worktree || path.resolve(run.worktree).toLowerCase() !== expectedWorktree.toLowerCase()) throw new Error('The MCP repair worktree is outside this run’s isolated worker directory.');
  const bridgeDir = path.join(dataDir, 'mcp-bridge');
  const activeFile = path.join(bridgeDir, 'active.json');
  const resultFile = path.join(bridgeDir, 'completion.json');
  await mkdir(bridgeDir, { recursive: true });
  try { await readFile(activeFile); throw new Error('Another MCP repair is already active.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(resultFile, { force: true });
  await writeJson(activeFile, {
    runId: run.id,
    objectiveHash: run.objectiveHash,
    task: run.task,
    objective: run.objective,
    kaneFailure: kaneFailure.slice(-10_000),
    worktree: expectedWorktree,
    createdAt: new Date().toISOString(),
  });
  const until = Date.now() + timeoutMs;
  try {
    while (Date.now() < until) {
      try {
        const completion = JSON.parse(await readFile(resultFile, 'utf8'));
        if (completion.runId !== run.id) throw new Error('The MCP completion does not match the active repair.');
        return { result: { code: 0, timedOut: false, overflow: false, stdout: String(completion.summary ?? '').slice(0, 4_000), stderr: '' }, version: 'local MCP client' };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { result: { code: 124, timedOut: true, overflow: false, stdout: '', stderr: 'No connected MCP client reported completion before the repair timeout.' }, version: 'local MCP client' };
  } finally {
    await rm(activeFile, { force: true });
    await rm(resultFile, { force: true });
  }
}
