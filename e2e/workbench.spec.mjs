import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const demoUrl = process.env.DEMO_URL ?? 'http://127.0.0.1:4180';

test('loads the workbench and reports real local tool readiness', async ({ page }) => {
  test.setTimeout(45_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Code changed. Did it work?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Describe the change' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local preflight' })).toBeVisible();
  await expect(page.getByText('No runs yet')).toBeVisible();
  await expect(page.locator('.preflight-row')).toHaveCount(4, { timeout: 30_000 });
  expect(pageErrors).toEqual([]);
});

test('keeps hosted sign-in active, refreshes expired pairing codes, and detects a paired runner without reload', async ({ page }) => {
  let runnerConnected = false;
  let pairingNumber = 0;
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/session', (route) => route.fulfill(json({ mode: 'google', authenticated: true, executionEnabled: true, user: { name: 'Demo User' } })));
  await page.route('**/api/preflight', (route) => route.fulfill(json({ hosted: true, executionEnabled: true, worker: { connected: runnerConnected, busy: false } })));
  await page.route('**/api/runs', (route) => route.fulfill(json({ runs: [] })));
  await page.route('**/api/worker/pair', (route) => route.fulfill(json({ code: `demo-pair-code-${++pairingNumber}`, expiresInSeconds: 1 })));

  await page.goto('/');
  await expect(page.locator('#session-bar')).toBeVisible();
  const originalPageTime = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: 'Connect local runner' }).click();
  await expect(page.locator('#pair-command')).toContainText('demo-pair-code-1');
  const refreshCode = page.getByRole('button', { name: 'Refresh pairing code' });
  await expect(refreshCode).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#pair-expiry')).toContainText('expired');

  await refreshCode.click();
  await expect(page.locator('#pair-command')).toContainText('demo-pair-code-2');
  runnerConnected = true;
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(page.locator('#worker-state')).toContainText('Choose a ready coding agent for repairs');
  await expect(page.locator('#pair-command')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Refresh pairing code' })).toBeHidden();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalPageTime);
});
test('serves the supplied backgrounds and assigns one to each screen', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'workbench');
  const workbenchBackground = await page.locator('body').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
  expect(workbenchBackground).toContain('/images/workbench.png');
  const evidenceBackground = await page.locator('#detail-dialog').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(evidenceBackground).toContain('/images/evidence-dialogue.png');

  await page.locator('body').evaluate((element) => { element.dataset.screen = 'signin'; });
  const signInBackground = await page.locator('body').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
  expect(signInBackground).toContain('/images/sign-in.png');

  for (const image of ['sign-in.png', 'workbench.png', 'evidence-dialogue.png']) {
    const response = await request.get(`/images/${image}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('publishes the hosted runner prerequisites and setup steps', async ({ page }) => {
  const response = await page.goto('/setup.html');
  expect(response.status()).toBe(200);
  await expect(page.locator('.setup-intro h1')).toContainText('Sign in on the site.');
  await expect(page.locator('.setup-intro h1')).toContainText('Run tools on your computer.');
  await expect(page.getByRole('heading', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kane CLI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Coding agents' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use the hosted PatchLoop page' })).toBeVisible();
  await expect(page.getByText(/pairing code expires after 10 minutes and works once/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Local setup in the repository/ })).toHaveAttribute('href', 'https://github.com/demonchant/patchloop/tree/main#try-it-locally');
});
test('loads a real bundled task prompt without creating fabricated run records', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load the bundled demo task' }).click();
  await expect(page.getByLabel('What should the coding agent change?')).toHaveValue(/archive and restore/);
  await expect(page.getByLabel(/Fixed Kane acceptance objective/)).toHaveValue(/restore it/);
  await expect(page.getByText('0 / 1600')).not.toBeVisible();
  await expect(page.getByText('No runs yet')).toBeVisible();
});

test('shows reported repository choices and submits the selected target id', async ({ page }) => {
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/session', (route) => route.fulfill(json({ mode: 'google', authenticated: true, executionEnabled: true, user: { name: 'Demo User' } })));
  await page.route('**/api/preflight', (route) => route.fulfill(json({ hosted: true, executionEnabled: true, worker: { connected: true, busy: false, agents: [
    { id: 'codex', name: 'Codex', supported: true, installed: false, authenticated: false, ready: false },
    { id: 'cursor', name: 'Cursor CLI', supported: true, installed: true, authenticated: true, ready: true },
  ] } })));
  await page.route('**/api/targets', (route) => route.fulfill(json({ targets: [
    { id: 'bundled-demo', name: 'Bundled Goodwork demo', ready: true },
    { id: 'configured', name: 'PatchLoop Full Showcase', ready: true, requirements: 'Node.js 20+ and committed Git checkout.' },
  ] })));
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      expect(payload.targetId).toBe('configured');
      expect(payload.agentId).toBe('cursor');
      await route.fulfill(json({ run: { id: 'demo-run-id', ...payload } }));
      return;
    }
    await route.fulfill(json({ runs: [] }));
  });

  await page.goto('/');
  const picker = page.getByLabel('Target repository');
  await expect(picker).toHaveValue('bundled-demo');
  await expect(picker.locator('option')).toHaveCount(3);
  await picker.selectOption('configured');
  await expect(page.locator('#target-requirements')).toHaveText('Node.js 20+ and committed Git checkout.');
  await page.getByLabel('Coding agent', { exact: true }).selectOption('cursor');
  await page.getByLabel('What should the coding agent change?').fill('Keep a completed task checked after restore.');
  await page.getByLabel(/Fixed Kane acceptance objective/).fill('Create, complete, archive, and restore a task, then confirm its title and completed checkbox are preserved.');
  await page.getByRole('button', { name: 'Run Kane verification' }).click();
  await expect(page.getByText(/is queued for your local runner/)).toBeVisible();
});

test('clears the default target when a GitHub repository link is entered', async ({ page }) => {
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/session', (route) => route.fulfill(json({ mode: 'google', authenticated: true, executionEnabled: true, user: { name: 'Demo User' } })));
  await page.route('**/api/preflight', (route) => route.fulfill(json({ hosted: true, executionEnabled: true, worker: { connected: true, busy: false, agents: [
    { id: 'codex', name: 'Codex', supported: true, installed: true, authenticated: true, ready: true },
  ] } })));
  await page.route('**/api/targets', (route) => route.fulfill(json({ targets: [{ id: 'bundled-demo', name: 'Bundled Goodwork demo', ready: true }] })));
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      expect(payload.targetId).toBeNull();
      expect(payload.targetUrl).toBe('https://github.com/demonchant/patchloop-full-showcase2');
      await route.fulfill(json({ run: { id: 'demo-run-id', ...payload } }));
      return;
    }
    await route.fulfill(json({ runs: [] }));
  });

  await page.goto('/');
  const picker = page.getByLabel('Target repository');
  await expect(picker).toHaveValue('bundled-demo');
  await page.getByLabel('Or use a GitHub repository link').fill('https://github.com/demonchant/patchloop-full-showcase2');
  await expect(picker).toHaveValue('');
  await page.getByLabel('What should the coding agent change?').fill('Keep the completed task state after restore.');
  await page.getByLabel(/Fixed Kane acceptance objective/).fill('Archive a completed task, restore it, and confirm its title and completion checkbox are preserved.');
  await page.getByRole('button', { name: 'Run Kane verification' }).click();
  await expect(page.getByText(/is queued for your local runner/)).toBeVisible();
});

test('keeps Details live while open and closes it with the visible X control', async ({ page }) => {
  test.setTimeout(15_000);
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const record = {
    id: 'live-detail-run', task: 'Preserve the completed state after restore.', objective: 'Restore the task with its title and completed checkmark.',
    objectiveHash: 'fixed-objective-hash', targetName: 'Bundled Goodwork demo', agentId: 'cursor', state: 'repairing', repairCount: 0,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    attempts: [{ id: 'kane-1', kind: 'kane', verdict: 'failed', objectiveHash: 'fixed-objective-hash', exitCode: 1, outputTail: 'The restored task is unchecked.', startedAt: new Date().toISOString() }],
    events: [{ type: 'repair_started', at: new Date().toISOString(), message: 'Cursor CLI started the isolated repair.' }],
  };
  let latest = structuredClone(record);
  await page.route('**/api/session', (route) => route.fulfill(json({ mode: 'google', authenticated: true, executionEnabled: true, user: { name: 'Demo User' } })));
  await page.route('**/api/preflight', (route) => route.fulfill(json({ hosted: true, executionEnabled: true, worker: { connected: true, busy: true, agents: [
    { id: 'cursor', name: 'Cursor CLI', supported: true, installed: true, authenticated: true, ready: true },
  ] } })));
  await page.route('**/api/targets', (route) => route.fulfill(json({ targets: [{ id: 'bundled-demo', name: 'Bundled Goodwork demo', ready: true }] })));
  await page.route('**/api/runs/live-detail-run', (route) => route.fulfill(json({ run: latest })));
  await page.route('**/api/runs', (route) => route.fulfill(json({ runs: [latest] })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.locator('#detail-body')).toContainText('Cursor CLI started the isolated repair.');
  await expect(page.locator('#detail-body')).toContainText(/has not sent an update for 1m \d+s/);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('test-update-details'));
  });
  latest = {
    ...record,
    state: 'unresolved',
    repairCount: 1,
    lastDiff: 'diff --git a/tasks.js b/tasks.js\n+completed: true',
    diffStat: 'tasks.js | 1 +',
    attempts: [...record.attempts, { id: 'agent-1', kind: 'agent', providerId: 'cursor', providerVersion: 'Cursor CLI 1.0', changed: true, exitCode: 0, outputTail: 'Updated archive restore state.' }],
    events: [...record.events, { type: 'repair_finished', at: new Date().toISOString(), message: 'Cursor CLI changed files. The same objective is ready to rerun.' }],
  };
  await expect(page.locator('#detail-body')).toContainText('Updated archive restore state.', { timeout: 7_000 });
  await expect(page.locator('#detail-body')).toContainText('Cursor CLI');
  await expect(page.locator('#detail-refresh-state')).toContainText('live while open');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
});

test('offers Kane verification for a saved diff after the agent exits with an error', async ({ page }) => {
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const run = {
    id: 'saved-diff-run', task: 'Preserve completed status during restore.', objective: 'Restore a completed task and confirm the checkbox remains checked.',
    objectiveHash: 'saved-objective', agentId: 'codex', state: 'agent_error', repairCount: 2, updatedAt: new Date().toISOString(),
    lastDiff: 'diff --git a/server.mjs b/server.mjs\n+preserve completed', diffStat: 'server.mjs | 1 +',
    attempts: [
      { id: 'verify-1', kind: 'kane', verdict: 'failed', objectiveHash: 'saved-objective', exitCode: 1, outputTail: 'Restore cleared completed state.' },
      { id: 'agent-2', kind: 'agent', providerId: 'codex', changed: true, exitCode: 2, outputTail: 'Codex stopped after saving the change.' },
    ],
    events: [{ type: 'repair_finished', at: new Date().toISOString(), message: 'Codex produced a diff but exited with an error.' }],
  };
  let verifyRequested = false;
  await page.route('**/api/session', (route) => route.fulfill(json({ mode: 'google', authenticated: true, executionEnabled: true, user: { name: 'Demo User' } })));
  await page.route('**/api/preflight', (route) => route.fulfill(json({ hosted: true, executionEnabled: true, worker: { connected: true, busy: false, agents: [] } })));
  await page.route('**/api/targets', (route) => route.fulfill(json({ targets: [{ id: 'bundled-demo', name: 'Bundled Goodwork demo', ready: true }] })));
  await page.route('**/api/runs/saved-diff-run', (route) => route.fulfill(json({ run })));
  await page.route('**/api/runs/saved-diff-run/verify', async (route) => {
    verifyRequested = route.request().method() === 'POST';
    await route.fulfill(json({ accepted: true }));
  });
  await page.route('**/api/runs', (route) => route.fulfill(json({ runs: [run] })));

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run same Kane check ↻' })).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.locator('#detail-body')).toContainText('stopped with an error after saving a code diff');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Run same Kane check ↻' }).click();
  await expect(page.getByText(/unchanged objective is queued for your local runner/)).toBeVisible();
  expect(verifyRequested).toBe(true);
});

test('keeps all primary controls keyboard reachable and usable on a narrow viewport', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const task = page.getByLabel('What should the coding agent change?');
  await task.focus();
  await expect(task).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/Fixed Kane acceptance objective/)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Run Kane verification' })).toBeVisible();
  const documentWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);
});

test('exposes health and refuses incomplete task submissions without starting tools', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ ok: true, name: 'PatchLoop' });
  const invalid = await request.post('/api/runs', { data: { task: 'short', objective: 'too short' } });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toHaveProperty('error');
  const unsupportedAgent = await request.post('/api/runs', { data: {
    task: 'Reject an unregistered provider before creating a run',
    objective: 'Confirm only runner-registered providers can be selected.',
    agentId: 'run-this-command',
  } });
  expect(unsupportedAgent.status()).toBe(400);
  expect(await unsupportedAgent.json()).toHaveProperty('error', 'Choose a supported coding agent.');
  const runs = await request.get('/api/runs');
  expect((await runs.json()).runs).toEqual([]);
});

test('publishes the bundled target and rejects an unavailable repository selection', async ({ request }) => {
  const catalog = await request.get('/api/targets');
  expect(catalog.ok()).toBeTruthy();
  expect((await catalog.json()).targets).toContainEqual(expect.objectContaining({ id: 'bundled-demo', ready: true }));
  const rejected = await request.post('/api/runs', { data: {
    task: 'Verify an unavailable repository is rejected',
    objective: 'Confirm unavailable repository targets cannot create a run.',
    targetId: 'stale-target',
  } });
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toHaveProperty('error', 'Choose an available repository from the target picker or enter a GitHub repository link.');
});

test('adds safe response headers and blocks cross-origin state changes', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  const blocked = await request.post('/api/runs', {
    headers: { origin: 'https://outside.invalid' },
    data: { task: 'A sufficiently long change request', objective: 'A sufficiently long acceptance objective' },
  });
  expect(blocked.status()).toBe(403);
});

test('archives a completed task and restores it to Active with its checkmark', async ({ page, request }) => {
  const title = `Pay electricity bill ${randomUUID()}`;
  const created = await request.post(`${demoUrl}/api/tasks`, { data: { title } });
  expect(created.status()).toBe(201);
  const task = (await created.json()).task;

  const completed = await request.post(`${demoUrl}/api/tasks/${task.id}/complete`);
  expect(completed.status()).toBe(200);
  expect((await completed.json()).task.completed).toBe(true);

  await page.goto(demoUrl);
  const activeRow = page.locator('li.task', { hasText: title });
  await expect(activeRow).toBeVisible();
  await expect(activeRow.locator('.complete')).toHaveAttribute('aria-label', `Mark active: ${title}`);

  await activeRow.getByRole('button', { name: 'Archive' }).click();
  await expect(activeRow).toHaveCount(0);

  await page.getByRole('button', { name: /Archived/ }).click();
  const archivedRow = page.locator('li.task', { hasText: title });
  await expect(archivedRow).toBeVisible();
  await archivedRow.getByRole('button', { name: 'Restore' }).click();
  await expect(archivedRow).toHaveCount(0);

  await page.getByRole('button', { name: /Active/ }).click();
  const restoredRow = page.locator('li.task', { hasText: title });
  await expect(restoredRow).toBeVisible();
  await expect(restoredRow).toHaveClass(/is-complete/);
  await expect(restoredRow.locator('.complete')).toHaveAttribute('aria-label', `Mark active: ${title}`);

  const finalTasks = (await (await request.get(`${demoUrl}/api/tasks`)).json()).tasks;
  expect(finalTasks.find((item) => item.id === task.id)).toMatchObject({ completed: true, archived: false });
});
