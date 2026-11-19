import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

const workerFreshMs = 45_000;
const maxAttempts = 24;
const maxEvents = 400;

function isSuccessfulKaneAttempt(attempt, objectiveHash) {
  if (!attempt || attempt.kind !== 'kane' || attempt.objectiveHash !== objectiveHash || attempt.exitCode !== 0 || attempt.verdict !== 'passed' || typeof attempt.finalEvent !== 'string') return false;
  try {
    const event = JSON.parse(attempt.finalEvent);
    return (event.type ?? event.event) === 'run_end' && String(event.status ?? '').toLowerCase() === 'passed' && event.result_code !== 740;
  } catch { return false; }
}

export class Store {
  #file;
  #queue = Promise.resolve();

  constructor(file) { this.#file = file; }

  async #read() {
    try {
      const data = JSON.parse(await readFile(this.#file, 'utf8'));
      if (!Array.isArray(data.runs) || !Array.isArray(data.workers)) throw new Error('Store file has an unsupported shape.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { schema: 1, runs: [], workers: [] };
      throw error;
    }
  }

  async #write(data) {
    await mkdir(path.dirname(this.#file), { recursive: true });
    const temp = `${this.#file}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, this.#file);
  }

  #mutate(fn) {
    const result = this.#queue.then(async () => {
      const data = await this.#read();
      const value = await fn(data);
      await this.#write(data);
      return value;
    });
    this.#queue = result.catch(() => {});
    return result;
  }

  async list(ownerId) {
    await this.#queue;
    const data = await this.#read();
    return data.runs.filter((run) => run.ownerId === ownerId).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id, ownerId) {
    return (await this.list(ownerId)).find((run) => run.id === id) ?? null;
  }

  create({ ownerId, task, objective, targetId, queueAction = null }) {
    return this.#mutate((data) => {
      const now = new Date().toISOString();
      const run = {
        id: randomUUID(), ownerId, createdAt: now, updatedAt: now, state: queueAction ? 'queued' : 'queued',
        task, objective, objectiveHash: createHash('sha256').update(objective, 'utf8').digest('hex'), targetId, queueAction, repairCount: 0,
        attempts: [], events: [{ at: now, type: 'created', message: 'Task and fixed browser objective saved.' }],
        lastDiff: '', diffStat: '',
      };
      data.runs.unshift(run);
      return run;
    });
  }

  update(id, ownerId, fn) {
    return this.#mutate((data) => {
      const run = data.runs.find((item) => item.id === id && item.ownerId === ownerId);
      if (!run) throw new Error('Run not found.');
      fn(run);
      run.updatedAt = new Date().toISOString();
      return run;
    });
  }

  acceptRunnerRun(snapshot) {
    return this.#mutate((data) => {
      const run = { ...structuredClone(snapshot), ownerId: 'local-runner', queueAction: null, claimedBy: null };
      const existing = data.runs.find((item) => item.id === run.id && item.ownerId === 'local-runner');
      if (existing) {
        if (existing.task !== run.task || existing.objective !== run.objective || existing.objectiveHash !== run.objectiveHash || existing.targetId !== run.targetId) throw new Error('Runner task does not match its saved record.');
        return existing;
      }
      data.runs.unshift(run);
      return run;
    });
  }

  enqueue(id, ownerId, action) {
    return this.update(id, ownerId, (run) => {
      if (!['verify', 'repair'].includes(action)) throw new Error('Unknown runner action.');
      run.queueAction = action;
      run.state = action === 'repair' ? 'repairing' : 'queued';
      run.events.push({ at: new Date().toISOString(), type: action === 'repair' ? 'repair_queued' : 'verification_queued', message: action === 'repair' ? 'Approved repair queued for the paired runner.' : 'The unchanged objective was queued for Kane.' });
    });
  }

  registerWorker(ownerId, tokenHash, targets) {
    return this.#mutate((data) => {
      data.workers = data.workers.filter((worker) => worker.ownerId !== ownerId);
      const worker = { ownerId, tokenHash, targets, connectedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), busy: false };
      data.workers.push(worker);
      return worker;
    });
  }

  async workerByTokenHash(tokenHash) {
    await this.#queue;
    return (await this.#read()).workers.find((worker) => worker.tokenHash === tokenHash) ?? null;
  }

  async workerForOwner(ownerId) {
    await this.#queue;
    const worker = (await this.#read()).workers.find((item) => item.ownerId === ownerId);
    if (!worker) return { connected: false, busy: false, targets: [] };
    return { connected: Date.now() - Date.parse(worker.lastSeenAt) < workerFreshMs, busy: worker.busy, targets: worker.targets ?? [] };
  }

  setTargets(tokenHash, targets) {
    return this.#mutate((data) => {
      const worker = data.workers.find((item) => item.tokenHash === tokenHash);
      if (!worker) throw new Error('Runner pairing is no longer valid.');
      worker.targets = targets;
      worker.lastSeenAt = new Date().toISOString();
      return worker.targets;
    });
  }

  heartbeat(tokenHash, busy = false) {
    return this.#mutate((data) => {
      const worker = data.workers.find((item) => item.tokenHash === tokenHash);
      if (!worker) throw new Error('Runner pairing is no longer valid.');
      worker.lastSeenAt = new Date().toISOString();
      worker.busy = busy;
      return true;
    });
  }

  claimNext(tokenHash) {
    return this.#mutate((data) => {
      const worker = data.workers.find((item) => item.tokenHash === tokenHash);
      if (!worker) throw new Error('Runner pairing is no longer valid.');
      const now = new Date().toISOString();
      if (worker.busy) {
        const active = data.runs.find((item) => item.claimedBy === tokenHash);
        if (Date.now() - Date.parse(worker.lastSeenAt) < workerFreshMs) return null;
        worker.busy = false;
        if (active) {
          active.claimedBy = null;
          active.claimedAction = null;
          active.state = 'inconclusive';
          active.events.push({ at: now, type: 'worker_lost', message: 'Runner connection expired during the task; inspect the saved worktree before retrying.' });
          active.updatedAt = now;
        }
      }
      worker.lastSeenAt = now;
      const run = data.runs.find((item) => item.ownerId === worker.ownerId && item.queueAction && !item.claimedBy);
      if (!run) { worker.busy = false; return null; }
      const target = worker.targets.find((item) => item.id === run.targetId && item.ready);
      if (!target) {
        run.state = 'setup_error';
        run.queueAction = null;
        run.events.push({ at: now, type: 'setup_error', message: 'The selected repository is unavailable on the paired runner. Register it and retry.' });
        worker.busy = false;
        return null;
      }
      worker.busy = true;
      run.claimedBy = tokenHash;
      run.claimedAction = run.queueAction;
      run.queueAction = null;
      run.claimedAt = now;
      run.state = run.claimedAction === 'repair' ? 'repairing' : 'verifying';
      run.events.push({ at: now, type: 'worker_claimed', message: 'Paired runner accepted the task.' });
      return { run: structuredClone(run), action: run.claimedAction };
    });
  }

  report(tokenHash, snapshot) {
    return this.#mutate((data) => {
      const worker = data.workers.find((item) => item.tokenHash === tokenHash);
      const run = data.runs.find((item) => item.id === snapshot.id && item.ownerId === worker?.ownerId);
      if (!worker || !run || run.claimedBy !== tokenHash) throw new Error('Runner does not own this task.');
      if (snapshot.task !== run.task || snapshot.objective !== run.objective || snapshot.objectiveHash !== run.objectiveHash || snapshot.targetId !== run.targetId) throw new Error('Runner report changed immutable task data.');
      if (!Array.isArray(snapshot.attempts) || snapshot.attempts.length > maxAttempts || !Array.isArray(snapshot.events) || snapshot.events.length > maxEvents || !['needs_review', 'agent_error', 'unresolved', 'inconclusive', 'setup_error', 'verified'].includes(snapshot.state)) throw new Error('Runner report is incomplete.');
      if (createHash('sha256').update(run.objective, 'utf8').digest('hex') !== run.objectiveHash) throw new Error('Saved objective hash is invalid.');
      if (snapshot.attempts.some((attempt) => !attempt || !['kane', 'agent'].includes(attempt.kind) || (!Number.isFinite(attempt.exitCode) && attempt.exitCode !== null) || typeof attempt.id !== 'string' || attempt.id.length > 100 || typeof attempt.verdict !== 'string' || attempt.verdict.length > 40 || typeof attempt.outputTail !== 'string' || attempt.outputTail.length > 8_000 || (attempt.finalEvent !== null && attempt.finalEvent !== undefined && (typeof attempt.finalEvent !== 'string' || attempt.finalEvent.length > 6_000)))) throw new Error('Runner attempt data is invalid.');
      if (snapshot.events.some((event) => !event || typeof event.type !== 'string' || event.type.length > 80 || typeof event.message !== 'string' || event.message.length > 1_600)) throw new Error('Runner event data is invalid.');
      if (!Number.isInteger(snapshot.repairCount) || snapshot.repairCount < run.repairCount || snapshot.repairCount > 2) throw new Error('Runner repair count is invalid.');
      if (snapshot.state === 'verified' && !isSuccessfulKaneAttempt(snapshot.attempts.at(-1), run.objectiveHash)) throw new Error('A verified report needs a successful final Kane event for the unchanged objective.');
      if (snapshot.attempts.some((attempt) => attempt.kind === 'kane' && attempt.objectiveHash !== run.objectiveHash)) throw new Error('Runner attempt history contains a different objective.');
      run.state = snapshot.state;
      run.repairCount = snapshot.repairCount;
      run.attempts = snapshot.attempts.map((attempt) => ({
        id: attempt.id, kind: attempt.kind, startedAt: String(attempt.startedAt ?? '').slice(0, 40), completedAt: String(attempt.completedAt ?? '').slice(0, 40),
        objectiveHash: attempt.objectiveHash ?? null, exitCode: attempt.exitCode, timedOut: Boolean(attempt.timedOut), verdict: attempt.verdict,
        finalEvent: typeof attempt.finalEvent === 'string' ? attempt.finalEvent : null, outputTail: attempt.outputTail,
        resultCode: attempt.resultCode ?? null, status: attempt.status ?? null, malformedCount: Number(attempt.malformedCount) || 0,
        changed: Boolean(attempt.changed), diffHash: attempt.diffHash ?? null,
      }));
      run.events = snapshot.events.map((event) => ({ at: String(event.at ?? '').slice(0, 40), type: event.type, message: event.message }));
      run.lastDiff = String(snapshot.lastDiff ?? '').slice(0, 1_400_000);
      run.diffStat = String(snapshot.diffStat ?? '').slice(0, 2_000);
      run.queueAction = null;
      run.claimedBy = null;
      run.claimedAction = null;
      run.claimedAt = null;
      run.updatedAt = new Date().toISOString();
      worker.busy = false;
      worker.lastSeenAt = run.updatedAt;
      return run;
    });
  }

  disconnect(tokenHash) {
    return this.#mutate((data) => {
      const worker = data.workers.find((item) => item.tokenHash === tokenHash);
      if (!worker) return false;
      data.workers = data.workers.filter((item) => item.tokenHash !== tokenHash);
      return true;
    });
  }
}
