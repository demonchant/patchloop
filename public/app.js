const $ = (selector) => document.querySelector(selector);
const form = $('#run-form');
const taskInput = $('#task');
const objectiveInput = $('#objective');
const targetSelect = $('#target-repo');
const runsElement = $('#runs');
const notice = $('#notice');
const detailDialog = $('#detail-dialog');
let session = null;
let availableTargets = [];
let pairingExpiresAt = null;
let pairingTimer = null;
let runsLoadedOnce = false;
const announcedRunStates = new Map();

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const time = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Time not recorded';
const stateNames = { queued: 'Queued', verifying: 'Kane is checking', needs_review: 'Review the failure', repairing: 'Codex is repairing', agent_error: 'Agent stopped', unresolved: 'Ready to retest', inconclusive: 'Inconclusive', setup_error: 'Setup needs attention', verified: 'Verified by Kane' };

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : {}; } catch { value = text; }
  if (!response.ok) throw new Error(value?.error ?? `Request failed (${response.status}).`);
  return value;
}

function message(text, error = false) {
  notice.hidden = false;
  notice.textContent = text;
  notice.classList.toggle('is-error', error);
}

function counts() {
  $('#task-count').textContent = `${taskInput.value.length} / 1600`;
  $('#objective-count').textContent = `${objectiveInput.value.length} / 1800`;
}

function renderPreflight(result) {
  const preflight = $('#preflight');
  const workerConnect = $('#worker-connect');
  if (result.hosted) {
    const worker = result.worker ?? {};
    const rows = [
      ['Local runner', worker.connected ? (worker.busy ? 'Processing a task' : 'Connected') : 'Offline', worker.connected],
      ['Registered targets', String((worker.targets ?? []).filter((target) => target.ready).length), worker.connected && (worker.targets ?? []).some((target) => target.ready)],
      ['Provider sign-ins', 'Stay on this computer', true],
    ];
    preflight.innerHTML = rows.map(([label, value, good]) => `<div class="preflight-row"><span>${escapeHtml(label)}</span><strong class="${good ? 'ok' : 'bad'}">${escapeHtml(value)}</strong></div>`).join('');
    workerConnect.hidden = !result.executionEnabled;
    updatePairingControls(worker);
    updateReadyStamp(Boolean(worker.connected && (worker.targets ?? []).some((target) => target.ready)));
    return;
  }
  workerConnect.hidden = true;
  const rows = [
    ['Kane CLI', result.kane?.installed ? result.kane.version : 'Not found', result.kane?.installed],
    ['Kane sign-in', result.kane?.authenticated ? 'Authenticated' : 'Sign-in needed', result.kane?.authenticated],
    ['Codex CLI', result.agent?.installed ? result.agent.version : 'Not found', result.agent?.installed],
    ['Target app', result.target?.ok ? result.target.name : 'Not ready', result.target?.ok],
  ];
  preflight.innerHTML = rows.map(([label, value, good]) => `<div class="preflight-row"><span>${escapeHtml(label)}</span><strong class="${good ? 'ok' : 'bad'}">${escapeHtml(value ?? '')}</strong></div>`).join('');
  updateReadyStamp(Boolean(result.kane?.authenticated && result.agent?.installed && result.target?.ok));
}

function updateReadyStamp(ready) {
  const stamp = $('#ready-stamp');
  if (!stamp) return;
  stamp.classList.toggle('is-unready', !ready);
  stamp.innerHTML = `<i></i> ${ready ? 'Ready' : 'Not ready'}`;
}

function updatePairingControls(worker = {}) {
  const connect = $('#pair-worker');
  const refresh = $('#refresh-pair-code');
  const command = $('#pair-command');
  const copy = $('#copy-pair-command');
  const expiry = $('#pair-expiry');
  if (worker.connected) {
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = null;
    pairingExpiresAt = null;
    connect.hidden = true;
    refresh.hidden = true;
    command.hidden = true;
    copy.hidden = true;
    expiry.hidden = true;
    $('#worker-state').textContent = worker.busy ? 'Runner connected and processing a task.' : 'Runner connected. It will pick up work from this private session.';
    return;
  }
  if (!pairingExpiresAt) {
    connect.hidden = false;
    refresh.hidden = true;
    command.hidden = true;
    copy.hidden = true;
    expiry.hidden = true;
    $('#worker-state').textContent = 'Connect the computer that has Kane and Codex installed.';
    return;
  }
  const seconds = Math.max(0, Math.ceil((pairingExpiresAt - Date.now()) / 1000));
  if (!seconds) {
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = null;
    pairingExpiresAt = null;
    command.textContent = '';
    command.hidden = true;
    copy.hidden = true;
    expiry.textContent = 'Pairing code expired. Create a fresh code to continue.';
    expiry.hidden = false;
    connect.hidden = true;
    refresh.hidden = false;
    return;
  }
  expiry.textContent = `Pairing code expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`;
  expiry.hidden = false;
  connect.hidden = true;
  refresh.hidden = true;
}

async function loadPreflight() {
  $('#preflight').innerHTML = '<p class="loading-line">Checking your runner…</p>';
  try { renderPreflight(await api('/api/preflight')); }
  catch (error) { $('#preflight').innerHTML = `<p class="preflight-error">${escapeHtml(error.message)}</p>`; updateReadyStamp(false); }
}

async function loadTargets() {
  try {
    const { targets = [] } = await api('/api/targets');
    availableTargets = targets;
    const ready = targets.filter((target) => target.ready);
    const previous = targetSelect.value;
    targetSelect.innerHTML = ready.length
      ? ready.map((target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(target.name)}</option>`).join('')
      : '<option value="">Connect a runner with a ready target</option>';
    if (ready.some((target) => target.id === previous)) targetSelect.value = previous;
    targetSelect.disabled = !ready.length;
    $('#target-requirements').textContent = ready.find((target) => target.id === targetSelect.value)?.requirements ?? 'Connect your local runner to register a repository.';
    $('#submit-run').disabled = !ready.length;
    if (session?.mode === 'local') updateReadyStamp(Boolean(ready.length && !$('#preflight').querySelector('.preflight-row strong.bad')));
  } catch (error) {
    availableTargets = [];
    targetSelect.innerHTML = '<option value="">Repository list unavailable</option>';
    targetSelect.disabled = true;
    $('#submit-run').disabled = true;
    $('#target-requirements').textContent = error.message;
  }
}

targetSelect.addEventListener('change', () => {
  $('#target-requirements').textContent = availableTargets.find((target) => target.id === targetSelect.value)?.requirements ?? 'This repository runs in an isolated worktree on your computer.';
});

function repeatedFailure(run) {
  const kane = run.attempts.filter((attempt) => attempt.kind === 'kane').slice(-2);
  return kane.length === 2 && kane.every((attempt) => attempt.verdict === 'failed' && attempt.objectiveHash === run.objectiveHash);
}

function updateRoute(run) {
  const steps = [...document.querySelectorAll('[data-route-step]')];
  if (!run) {
    steps.forEach((item, index) => item.className = index === 0 ? 'is-current' : '');
    $('#route-status').textContent = 'Ready for a task';
    $('#route-caption').textContent = 'Each step leaves a record you can inspect.';
    return;
  }
  const hasKane = run.attempts.some((attempt) => attempt.kind === 'kane');
  const hasAgent = run.attempts.some((attempt) => attempt.kind === 'agent');
  let current = 0;
  let caption = 'The original objective is saved with this run.';
  if (['queued', 'verifying'].includes(run.state)) { current = 1; caption = 'Kane is checking the selected app in a real browser.'; }
  else if (['needs_review', 'agent_error'].includes(run.state)) { current = repeatedFailure(run) ? 2 : 1; caption = repeatedFailure(run) ? 'The same failure reproduced. Review it before approving Codex.' : 'Review the first result and replay the unchanged objective.'; }
  else if (run.state === 'repairing') { current = 2; caption = 'Codex is working in the isolated target worktree.'; }
  else if (run.state === 'unresolved' || (hasAgent && run.state === 'inconclusive')) { current = 3; caption = 'Review the diff, then rerun the saved objective with Kane.'; }
  else if (run.state === 'verified') { current = 4; caption = 'Kane passed the same objective after a reviewable repair.'; }
  else if (run.state === 'setup_error') { current = 1; caption = 'Fix the runner or target setup before retrying.'; }
  else if (run.state === 'inconclusive') { current = 1; caption = 'The result is uncertain. Review the record before continuing.'; }
  steps.forEach((item, index) => {
    item.className = index < current ? 'is-done' : (index === current ? (run.state === 'setup_error' ? 'is-alert' : 'is-current') : '');
  });
  $('#route-status').textContent = stateNames[run.state] ?? run.state;
  $('#route-caption').textContent = caption;
}

function renderRun(run) {
  const latest = [...run.attempts].reverse().find((attempt) => attempt.kind === 'kane');
  const canReplay = ['needs_review', 'unresolved', 'inconclusive', 'setup_error'].includes(run.state);
  const canRepair = ['needs_review', 'agent_error'].includes(run.state) && run.repairCount < 2 && (run.repairCount > 0 || repeatedFailure(run));
  const actions = `${canReplay ? `<button class="row-action" data-action="verify" data-id="${escapeHtml(run.id)}">${run.repairCount ? 'Rerun same check' : (repeatedFailure(run) ? 'Replay again' : 'Replay before repair')}</button>` : ''}${canRepair ? `<button class="row-action row-action-repair" data-action="repair" data-id="${escapeHtml(run.id)}">Approve Codex repair</button>` : ''}<button class="row-action row-action-detail" data-action="details" data-id="${escapeHtml(run.id)}">Evidence</button>`;
  return `<article class="run-row"><div class="run-row-main"><div class="run-state state-${escapeHtml(run.state)}"><i></i><span>${escapeHtml(stateNames[run.state] ?? run.state)}</span></div><div class="run-summary"><strong>${escapeHtml(run.task)}</strong><div><span>${escapeHtml(time(run.createdAt))}</span><span>${run.attempts.length} recorded step${run.attempts.length === 1 ? '' : 's'}</span><span>Objective ${escapeHtml(run.objectiveHash.slice(0, 10))}</span>${latest ? `<span>Latest Kane: ${escapeHtml(latest.verdict)}</span>` : ''}</div></div><div class="run-actions">${actions}</div></div></article>`;
}

async function loadRuns() {
  try {
    const { runs = [] } = await api('/api/runs');
    for (const run of runs) {
      const previous = announcedRunStates.get(run.id);
      if (runsLoadedOnce && previous && previous !== run.state) {
        $('#run-announcement').textContent = `${run.task}: ${stateNames[run.state] ?? run.state}.`;
      }
      announcedRunStates.set(run.id, run.state);
    }
    runsLoadedOnce = true;
    $('#run-count').textContent = String(runs.length);
    runsElement.innerHTML = runs.length ? runs.map(renderRun).join('') : '<div class="empty-state"><span class="empty-glyph">∿</span><strong>No verification runs yet</strong><p>Choose a target and describe the browser behavior to begin.</p></div>';
    updateRoute(runs[0]);
  } catch (error) { message(error.message, true); }
}

const demoTask = 'Fix the showcase restore regression so a completed task keeps its completed state and title after it is restored from Archived.';
const demoObjective = "On the Tasks page, create a task named 'PatchLoop repair proof', mark it complete, archive it, confirm it is absent from Active and present in Archived, restore it, then confirm it is back in Active with the same title and its completed checkbox still checked.";
$('#load-example').addEventListener('click', () => {
  taskInput.value = demoTask;
  objectiveInput.value = demoObjective;
  counts();
  taskInput.focus();
});
taskInput.addEventListener('input', counts);
objectiveInput.addEventListener('input', counts);

async function createPairing(button) {
  button.disabled = true;
  try {
    const { code, expiresInSeconds = 600 } = await api('/api/worker/pair', { method: 'POST', body: '{}' });
    const command = `npm run worker -- --url ${location.origin} --pair-code ${code}`;
    $('#pair-command').textContent = `${command}\n\nAfter pairing, restart without the code: npm run worker -- --url ${location.origin}`;
    $('#pair-command').hidden = false;
    $('#copy-pair-command').hidden = false;
    $('#refresh-pair-code').hidden = true;
    pairingExpiresAt = Date.now() + expiresInSeconds * 1000;
    updatePairingControls();
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = setInterval(() => updatePairingControls(), 1000);
    message('One-time code created. Run the command on the computer with Kane and Codex installed.');
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}
$('#pair-worker').addEventListener('click', (event) => void createPairing(event.currentTarget));
$('#refresh-pair-code').addEventListener('click', (event) => void createPairing(event.currentTarget));
$('#copy-pair-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#pair-command').textContent.split('\n')[0]); message('Pairing command copied.'); }
  catch { message('Clipboard access was blocked. Select and copy the first line.'); }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = $('#submit-run');
  button.disabled = true;
  notice.hidden = true;
  try {
    const { run } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ task: taskInput.value, objective: objectiveInput.value, targetId: targetSelect.value }) });
    message(session?.mode === 'google' ? `Run ${run.id.slice(0, 8)} queued for your local runner.` : `Run ${run.id.slice(0, 8)} started. Kane is opening the target app.`);
    taskInput.value = '';
    objectiveInput.value = '';
    counts();
    await loadRuns();
  } catch (error) { message(error.message, true); }
  finally { button.disabled = !availableTargets.some((target) => target.ready); }
});

function eventName(event) {
  return ({ created: 'Objective saved', worker_claimed: 'Runner accepted the task', verification_queued: 'Kane check queued', repair_queued: 'Codex repair queued', verification_started: 'Kane started the browser check', verification_finished: 'Kane finished the check', repair_started: 'Codex repair started', repair_finished: 'Codex repair finished', setup_error: 'Setup stopped', agent_error: 'Agent stopped' })[event.type] ?? event.type.replaceAll('_', ' ');
}

async function showDetails(id) {
  const { run } = await api(`/api/runs/${id}`);
  const attempts = run.attempts.map((attempt) => `<section class="detail-attempt"><div class="attempt-heading"><strong>${escapeHtml(attempt.kind === 'kane' ? 'Kane browser check' : 'Codex repair')}</strong><span>${escapeHtml(attempt.verdict ?? (attempt.changed ? 'Diff produced' : 'Finished'))}</span></div><p>${escapeHtml(`Started ${time(attempt.startedAt)} · exit ${attempt.exitCode ?? 'unknown'}${attempt.resultCode != null ? ` · result ${attempt.resultCode}` : ''}${attempt.timedOut ? ' · timed out' : ''}`)}</p><pre>${escapeHtml(attempt.outputTail ?? attempt.finalEvent ?? 'No tool output recorded.')}</pre></section>`).join('');
  const events = run.events.map((item) => `<li><time>${escapeHtml(time(item.at))}</time><span>${escapeHtml(eventName(item))}</span><p>${escapeHtml(item.message)}</p></li>`).join('');
  const diff = run.lastDiff ? `<a class="button button-secondary" href="/api/runs/${run.id}/diff" download="patchloop-${run.id}.patch">Download reviewed diff</a>` : '<p class="detail-empty">No code diff has been recorded.</p>';
  $('#detail-body').innerHTML = `<section class="detail-block"><p class="panel-kicker">CHANGE REQUEST</p><p>${escapeHtml(run.task)}</p></section><section class="detail-block"><p class="panel-kicker">FIXED OBJECTIVE · SHA-256 ${escapeHtml(run.objectiveHash)}</p><p class="detail-objective">${escapeHtml(run.objective)}</p></section><section class="detail-block"><div class="diff-heading"><div><p class="panel-kicker">WORKTREE DIFF</p><p>${escapeHtml(run.diffStat || 'No changed files')}</p></div>${diff}</div></section>${attempts}<section class="detail-block"><p class="panel-kicker">RUN TIMELINE</p><ol class="detail-timeline">${events}</ol></section>`;
  detailDialog.showModal();
}

runsElement.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'details') await showDetails(id);
    if (action === 'repair') {
      if (!confirm('Send the two matching Kane failures to Codex in the isolated target worktree?')) return;
      await api(`/api/runs/${id}/repair`, { method: 'POST' });
      message('Codex repair approved and queued. The fixed objective remains unchanged.');
      await loadRuns();
    }
    if (action === 'verify') {
      await api(`/api/runs/${id}/verify`, { method: 'POST' });
      message('The original objective is queued for Kane again.');
      await loadRuns();
    }
  } catch (error) { message(error.message, true); }
});

$('#close-dialog').addEventListener('click', () => detailDialog.close());
detailDialog.addEventListener('click', (event) => { if (event.target === detailDialog) detailDialog.close(); });
$('#sign-out').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); location.reload(); }
  catch (error) { message(error.message, true); }
});

async function initialize() {
  try {
    session = await api('/api/session');
    if (session.mode === 'google' && !session.authenticated) {
      document.body.dataset.screen = 'signin';
      $('#sign-in-screen').hidden = false;
      $('#app-main').hidden = true;
      return;
    }
    document.body.dataset.screen = 'workbench';
    $('#sign-in-screen').hidden = true;
    $('#app-main').hidden = false;
    if (session.mode === 'google') {
      $('#session-bar').hidden = false;
      $('#signed-in-user').textContent = session.user?.email || session.user?.name || 'Signed in';
      if (!session.executionEnabled) {
        $('#hosted-notice').textContent = 'The hosted runner is not enabled. Your private account is available, but tasks cannot be run yet.';
        $('#hosted-notice').hidden = false;
      }
    }
    await Promise.all([loadPreflight(), loadTargets(), loadRuns()]);
  } catch (error) {
    document.body.dataset.screen = 'signin';
    $('#sign-in-screen').hidden = false;
    $('#app-main').hidden = true;
    $('#sign-in-error').textContent = error.message;
    $('#sign-in-error').hidden = false;
  }
}

$('#refresh').addEventListener('click', () => { void loadPreflight(); void loadTargets(); void loadRuns(); });
$('#check-setup').addEventListener('click', () => { void loadPreflight(); void loadTargets(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { void loadPreflight(); void loadTargets(); void loadRuns(); } });
counts();
void initialize();
setInterval(() => { if (session?.authenticated || session?.mode === 'local') { void loadRuns(); void loadPreflight(); void loadTargets(); } }, 2500);
