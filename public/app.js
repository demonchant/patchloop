const $ = (selector) => document.querySelector(selector);
const form = $('#run-form');
const taskInput = $('#task');
const objectiveInput = $('#objective');
const agentSelect = $('#agent-id');
const runsElement = $('#runs');
const notice = $('#notice');
const detailDialog = $('#detail-dialog');
let lastRuns = [];
let activeSession = null;
let pairingExpiresAt = null;
let pairingTimer = null;
let availableTargets = [];
let openDetailsRunId = null;
let detailRefreshPending = false;
let agentCapabilities = [];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const humanState = (state) => ({ needs_review: 'Review failure', setup_error: 'Setup error', agent_error: 'Agent error', inconclusive: 'Inconclusive', unresolved: 'Still failing', verifying: 'Kane running', repairing: 'Agent working', queued: 'Queued', verified: 'Verified' })[state] ?? state;
const stamp = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const shortHash = (value = '') => value ? value.slice(0, 12) : 'not recorded';
const agentName = (id) => ({ codex: 'Codex', 'claude-code': 'Claude Code', cursor: 'Cursor CLI', copilot: 'GitHub Copilot CLI', kiro: 'Kiro CLI', mcp: 'Windsurf / custom MCP client' })[id] ?? 'Coding agent';

function renderAgentSelect(agents = []) {
  agentCapabilities = agents;
  const selected = agentSelect.value || 'codex';
  const supported = agents.filter((agent) => agent.supported !== false);
  const options = supported.length ? supported : [
    { id: 'codex', name: 'Codex', supported: true, ready: false, installed: false, setup: 'Connect a local runner to report available coding agents.' },
  ];
  const next = options.map((agent) => {
    let status = agent.ready ? (agent.authenticated === null ? 'installed · sign-in checked at run' : 'ready') : (agent.installed ? 'sign-in needed' : 'setup needed');
    return { id: agent.id, label: `${agent.name} · ${status}` };
  });
  const unchanged = agentSelect.options.length === next.length && next.every((option, index) => agentSelect.options[index].value === option.id && agentSelect.options[index].textContent === option.label);
  if (!unchanged) agentSelect.innerHTML = next.map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`).join('');
  if (next.some((option) => option.id === selected)) agentSelect.value = selected;
  const active = options.find((agent) => agent.id === agentSelect.value);
  $('#agent-help').textContent = active?.ready
    ? `${active.name} runs on your paired computer after your approval. Kane always verifies the same objective independently.`
    : `${active?.name ?? 'The selected agent'} is not confirmed ready. Kane verification can still run; set up the agent locally before requesting a repair.`;
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : {}; } catch { value = text; }
  if (!response.ok) throw new Error(value?.error ?? `Request failed (${response.status})`);
  return value;
}

function showNotice(message, error = false) {
  notice.hidden = false;
  notice.classList.toggle('error', error);
  notice.textContent = message;
}

function updatePairingControls(worker = {}) {
  const connectButton = $('#pair-worker');
  const refreshButton = $('#refresh-pair-code');
  const expiry = $('#pair-expiry');
  const command = $('#pair-command');
  const copyButton = $('#copy-pair-command');
  if (worker.connected) {
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = null;
    pairingExpiresAt = null;
    command.textContent = '';
    command.hidden = true;
    copyButton.hidden = true;
    expiry.hidden = true;
    connectButton.hidden = true;
    refreshButton.hidden = true;
    $('#worker-state').textContent = worker.busy ? 'Your local runner is connected and processing a task.' : 'Your local runner is connected. Choose a ready coding agent for repairs; Kane runs independently.';
    return;
  }
  if (!pairingExpiresAt) {
    expiry.hidden = true;
    connectButton.hidden = false;
    connectButton.textContent = 'Connect local runner';
    refreshButton.hidden = true;
    $('#worker-state').textContent = 'Start the local runner on your computer to process queued tasks.';
    return;
  }
  const secondsLeft = Math.max(0, Math.ceil((pairingExpiresAt - Date.now()) / 1000));
  if (secondsLeft === 0) {
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = null;
    pairingExpiresAt = null;
    command.textContent = '';
    command.hidden = true;
    copyButton.hidden = true;
    expiry.textContent = 'This pairing code expired. Generate a fresh code to try again.';
    expiry.hidden = false;
    connectButton.hidden = true;
    refreshButton.hidden = false;
    return;
  }
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  expiry.textContent = `Pairing code expires in ${minutes}:${seconds}. This page will show when the runner connects.`;
  expiry.hidden = false;
  connectButton.hidden = true;
  refreshButton.hidden = true;
}
function renderPreflight(result) {
  if (result.hosted) {
    const worker = result.worker ?? {};
    renderAgentSelect(worker.agents ?? []);
    const readyAgents = (worker.agents ?? []).filter((agent) => agent.ready).length;
    $('#preflight').innerHTML = `<div class="preflight-row"><span class="preflight-name">Private local runner</span><span class="preflight-value ${worker.connected ? 'ok' : 'bad'}">${worker.connected ? (worker.busy ? 'Working' : 'Connected') : 'Offline'}</span></div><div class="preflight-row"><span class="preflight-name">Coding agents ready</span><span class="preflight-value ${readyAgents ? 'ok' : 'bad'}">${worker.connected ? readyAgents : 'Connect runner'}</span></div><div class="preflight-row"><span class="preflight-name">Provider sign-ins</span><span class="preflight-value">Stay on your computer</span></div>`;
    updatePairingControls(worker);
    return;
  }
  const rows = [
    ['Kane CLI', result.kane.installed ? result.kane.version : 'Not found'],
    ['Kane sign-in', result.kane.authenticated ? 'Authenticated' : 'Sign-in needed'],
    ['Coding agents ready', (result.agents ?? []).filter((agent) => agent.ready).length],
    ['Target repo', result.target.ok ? result.target.mode : 'Not ready'],
  ];
  renderAgentSelect(result.agents ?? []);
  $('#preflight').innerHTML = rows.map(([label, value], index) => {
    const good = index === 0 ? result.kane.installed : index === 1 ? result.kane.authenticated : index === 2 ? Number(value) > 0 : result.target.ok;
    return `<div class="preflight-row"><span class="preflight-name">${escapeHtml(label)}</span><span class="preflight-value ${good ? 'ok' : 'bad'}">${escapeHtml(value)}</span></div>`;
  }).join('');
}

async function loadTargets() {
  const select = $('#target-repo');
  try {
    const { targets = [] } = await api('/api/targets');
    availableTargets = targets.filter((target) => target.ready);
    const current = select.value;
    const nextOptions = availableTargets.length
      ? availableTargets.map((target) => ({ id: target.id, name: `${target.name}${target.kind === 'github' && target.isPrivate ? ' · private' : ''}` }))
      : [{ id: '', name: 'Connect a runner to load repositories' }];
    const optionsUnchanged = select.options.length === nextOptions.length
      && nextOptions.every((target, index) => select.options[index].value === target.id && select.options[index].textContent === target.name);
    if (!optionsUnchanged) {
      select.innerHTML = nextOptions.map((target) => '<option value="' + escapeHtml(target.id) + '">' + escapeHtml(target.name) + '</option>').join('');
      if (availableTargets.some((target) => target.id === current)) select.value = current;
    }
    select.disabled = !availableTargets.length;
    const selected = availableTargets.find((target) => target.id === select.value);
    $('#target-requirements').textContent = selected?.requirements ?? (availableTargets.length ? 'This repository runs in a disposable worktree on your paired computer.' : 'Pair your local runner first; it will report the repositories available on that computer.');
  } catch { select.innerHTML = '<option value="">Repository list unavailable</option>'; select.disabled = true; }
}
$('#target-repo').addEventListener('change', () => {
  const selected = availableTargets.find((target) => target.id === $('#target-repo').value);
  $('#target-requirements').textContent = selected?.requirements ?? 'This repository runs in a disposable worktree on your paired computer.';
});

async function loadPreflight() {
  if (activeSession?.mode === 'google' && !activeSession.executionEnabled) {
    $('#preflight').innerHTML = '<div class="preflight-row"><span class="preflight-name">Hosted runner</span><span class="preflight-value bad">Not configured</span></div>';
    return;
  }
  $('#preflight').innerHTML = '<div class="preflight-loading"><span class="spinner"></span> Checking local tools…</div>';
  try { renderPreflight(await api('/api/preflight')); }
  catch { $('#preflight').innerHTML = '<div class="preflight-row"><span class="preflight-name">Local checks</span><span class="preflight-value bad">Unavailable</span></div>'; }
}

function eventLabel(event) {
  return ({ created: 'Task submitted', worker_claimed: 'Local runner accepted task', verification_queued: 'Kane run queued', repair_queued: 'Repair queued', worker_lost: 'Local runner disconnected', worker_disconnected: 'Local runner disconnected', verification_started: 'Kane browser run started', kane_flow_prepared: 'Kane prepared the flow', kane_action_started: 'Kane action started', verification_finished: 'Kane browser run completed', repair_started: 'Agent repair started', repair_finished: 'Agent repair completed', github_push_queued: 'GitHub push queued', github_push_started: 'GitHub branch push started', github_push_finished: 'GitHub branch pushed', github_push_failed: 'GitHub push failed', setup_error: 'Setup failed', agent_error: 'Agent stopped' })[event.type] ?? event.type;
}

function renderRun(run) {
  const latest = [...run.attempts].reverse().find((attempt) => attempt.kind === 'kane');
  const attempts = run.attempts.filter((attempt) => attempt.kind === 'kane');
  const lastTwo = attempts.slice(-2);
  const repeatedFailure = lastTwo.length === 2 && lastTwo.every((attempt) => attempt.verdict === 'failed' && attempt.objectiveHash === run.objectiveHash);
  const canRepair = ['needs_review', 'agent_error'].includes(run.state) && run.repairCount < 2 && (run.repairCount > 0 || repeatedFailure);
  const canReplay = ['needs_review', 'unresolved', 'inconclusive', 'setup_error'].includes(run.state);
  const latestAgent = [...run.attempts].reverse().find((attempt) => attempt.kind === 'agent');
  const canPush = run.targetUrl && run.state === 'verified' && run.repairCount > 0 && Boolean(run.lastDiff) && latest?.verdict === 'passed' && latestAgent?.exitCode === 0 && latestAgent.changed;
  const pushUrl = run.targetUrl && run.pushBranch ? `${run.targetUrl.replace(/\.git$/i, '').replace(/\/$/, '')}/tree/${run.pushBranch.split('/').map(encodeURIComponent).join('/')}` : '';
  const pushAction = canPush ? (run.pushStatus === 'pushed'
    ? `<a class="small-button" href="${escapeHtml(pushUrl)}" target="_blank" rel="noreferrer">Open pushed branch ↗</a>`
    : `<button class="small-button" data-action="push" data-id="${run.id}" ${['queued', 'pushing'].includes(run.pushStatus) ? 'disabled' : ''}>${run.pushStatus === 'queued' ? 'Push queued' : (run.pushStatus === 'pushing' ? 'Pushing repair…' : (run.pushStatus === 'failed' ? 'Retry GitHub push ↗' : 'Push repair branch ↗'))}</button>`) : '';
  const providerName = agentName(run.agentId ?? 'codex');
  const action = `${canReplay ? `<button class="small-button" data-action="verify" data-id="${run.id}">${run.repairCount ? 'Run same Kane check ↻' : (repeatedFailure ? 'Replay again ↻' : 'Replay before repair ↻')}</button>` : ''}${canRepair ? `<button class="small-button danger" data-action="repair" data-id="${run.id}">Send to ${escapeHtml(providerName)} ↗</button>` : ''}`;
  const runDetails = `${run.attempts.length} recorded step${run.attempts.length === 1 ? '' : 's'}`;
  const latestText = latest ? `${latest.verdict}${latest.resultCode !== null ? ` · code ${latest.resultCode}` : ''}` : 'Waiting for Kane';
  const targetText = run.targetName ? ` · ${run.targetName}` : '';
  return `<article class="run-card" data-run-card="${run.id}">
    <div class="run-main"><div class="run-status status-${escapeHtml(run.state)}"><i class="status-dot"></i>${escapeHtml(humanState(run.state))}</div>
      <div class="run-copy"><div class="run-task">${escapeHtml(run.task)}</div><div class="run-meta"><span>${escapeHtml(stamp(run.createdAt))}${escapeHtml(targetText)}</span><span>${escapeHtml(providerName)}</span><span>${escapeHtml(runDetails)}</span><span>${escapeHtml(latestText)}</span><span>objective ${escapeHtml(shortHash(run.objectiveHash))}</span></div></div>
      <div class="run-actions">${action}${pushAction}<button class="small-button" data-action="details" data-id="${run.id}">Details</button></div></div>
    <button class="run-expand" type="button" data-action="details" data-id="${run.id}">Open immutable objective and evidence ↓</button>
  </article>`;
}

async function loadRuns() {
  try {
    const { runs } = await api('/api/runs');
    lastRuns = runs;
    $('#run-count').textContent = String(runs.length);
    runsElement.innerHTML = runs.length ? runs.map(renderRun).join('') : '<div class="empty-state"><div class="empty-mark">↻</div><strong>No runs yet</strong><p>Your first real Kane verification will appear here.</p></div>';
    if (detailDialog.open && openDetailsRunId) void refreshOpenDetails();
  } catch (error) { showNotice(error.message, true); }
}

function counts() {
  $('#task-count').textContent = `${taskInput.value.length} / 1600`;
  $('#objective-count').textContent = `${objectiveInput.value.length} / 1800`;
}

const demoTask = 'Add archive and restore actions for completed tasks. Archived tasks must disappear from Active and appear in Archived. Restoring a task must preserve its title and completed status.';
const demoObjective = "On the Tasks page, add a task named 'Pay electricity bill', mark it completed, archive it, verify it is absent from Active and present in Archived, restore it, and verify it returns to Active with Completed status.";

$('#load-example').addEventListener('click', () => {
  taskInput.value = demoTask;
  objectiveInput.value = demoObjective;
  counts();
  taskInput.focus();
});
taskInput.addEventListener('input', counts);
objectiveInput.addEventListener('input', counts);
$('#refresh').addEventListener('click', () => { void loadRuns(); void loadPreflight(); void loadTargets(); });
$('#check-setup').addEventListener('click', () => void loadPreflight());
agentSelect.addEventListener('change', () => renderAgentSelect(agentCapabilities));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeSession?.mode === 'google') { void loadPreflight(); void loadTargets(); }
});

async function createPairingCode(button) {
  button.disabled = true;
  try {
    const { code, expiresInSeconds = 600 } = await api('/api/worker/pair', { method: 'POST', body: '{}' });
    const command = `npm run worker -- --url ${location.origin} --pair-code ${code}`;
    pairingExpiresAt = Date.now() + expiresInSeconds * 1000;
    $('#pair-command').textContent = `${command}\n\nThis code works once. After pairing, start the runner with: npm run worker -- --url ${location.origin}`;
    $('#pair-command').hidden = false;
    $('#copy-pair-command').hidden = false;
    $('#refresh-pair-code').hidden = true;
    updatePairingControls();
    if (pairingTimer) clearInterval(pairingTimer);
    pairingTimer = setInterval(() => updatePairingControls(), 1000);
    showNotice('Pairing code created. Run the first command on the computer with Kane and your selected coding agents.');
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
}
$('#pair-worker').addEventListener('click', (event) => void createPairingCode(event.currentTarget));
$('#refresh-pair-code').addEventListener('click', (event) => void createPairingCode(event.currentTarget));
$('#copy-pair-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#pair-command').textContent.split('\n')[0]); showNotice('Pairing command copied.'); }
  catch { showNotice('Copy was blocked by the browser. Select and copy the first line.', true); }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const githubUrl = $('#target-github-url').value.trim();
  const targetId = $('#target-repo').value;
  if (Boolean(githubUrl) === Boolean(targetId)) {
    showNotice(githubUrl ? 'Choose a listed repository or enter a GitHub link, not both.' : 'Choose a repository or paste a GitHub repository link.', true);
    return;
  }
  const button = $('#submit-run');
  button.disabled = true;
  notice.hidden = true;
  try {
    const { run } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ task: taskInput.value, objective: objectiveInput.value, agentId: agentSelect.value, targetId: githubUrl ? null : targetId, targetUrl: githubUrl || null }) });
    showNotice(activeSession?.mode === 'google' ? `Task ${run.id.slice(0, 8)} is queued for your local runner.` : `Task ${run.id.slice(0, 8)} created. Kane is starting a real browser run.`);
    taskInput.value = '';
    objectiveInput.value = '';
    $('#target-github-url').value = '';
    counts();
    await loadRuns();
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});

function renderDetails(run) {
  const provider = agentName(run.agentId ?? 'codex');
  const latestAgent = [...run.attempts].reverse().find((attempt) => attempt.kind === 'agent');
  const repairSummary = latestAgent
    ? (latestAgent.exitCode === 0 && latestAgent.changed
      ? `${agentName(latestAgent.providerId ?? run.agentId ?? 'codex')} finished with a code change. Kane still needs to rerun the fixed objective.`
      : `${agentName(latestAgent.providerId ?? run.agentId ?? 'codex')} did not produce a successful code change. Review its recorded output before retrying.`)
    : (run.state === 'repairing' ? `${provider} is working in the isolated repair worktree.` : `No ${provider} repair attempt is recorded yet.`);
  const attempts = run.attempts.map((attempt) => {
    const attemptProvider = attempt.kind === 'agent' ? agentName(attempt.providerId ?? run.agentId ?? 'codex') : 'Kane CLI';
    const providerVersion = attempt.providerVersion ? ` · ${attempt.providerVersion}` : '';
    return `<section class="dialog-section"><div class="detail-label">${escapeHtml(attemptProvider.toUpperCase())}${escapeHtml(providerVersion)} · ${escapeHtml(attempt.id)} · ${escapeHtml(attempt.verdict ?? (attempt.changed ? 'CHANGED FILES' : 'COMPLETE'))}</div><p>${escapeHtml(`Started ${stamp(attempt.startedAt)} · exit ${attempt.exitCode ?? 'unknown'}${attempt.resultCode !== undefined && attempt.resultCode !== null ? ` · result code ${attempt.resultCode}` : ''}${attempt.reasonCode ? ` · ${attempt.reasonCode}` : ''}${attempt.timedOut ? ' · timed out' : ''}${attempt.overflow ? ' · output limit reached' : ''}`)}</p><pre>${escapeHtml(attempt.outputTail ?? attempt.finalEvent ?? 'No CLI output recorded.')}</pre></section>`;
  }).join('');
  const events = run.events.map((item) => `<p><span class="detail-label">${escapeHtml(stamp(item.at))} · ${escapeHtml(eventLabel(item))}</span><br>${escapeHtml(item.message)}</p>`).join('');
  const diff = run.lastDiff ? `<div class="detail-actions"><a class="small-button" href="/api/runs/${run.id}/diff" download="patchloop-${run.id}.patch">Download worktree diff</a></div>` : '<p>No code diff recorded.</p>';
  const target = run.targetUrl ? `<section class="dialog-section"><div class="detail-label">GITHUB TARGET</div><p><a href="${escapeHtml(run.targetUrl)}" target="_blank" rel="noreferrer">${escapeHtml(run.targetName ?? run.targetUrl)}</a><br>Fetched by the local runner when verification starts.</p></section>` : '';
  const pushUrl = run.targetUrl && run.pushBranch ? `${run.targetUrl.replace(/\.git$/i, '').replace(/\/$/, '')}/tree/${run.pushBranch.split('/').map(encodeURIComponent).join('/')}` : '';
  const pushed = run.pushStatus ? `<section class="dialog-section"><div class="detail-label">GITHUB PUSH · ${escapeHtml(run.pushStatus.toUpperCase())}</div><p>${run.pushStatus === 'pushed' ? `Branch <code>${escapeHtml(run.pushBranch)}</code> · commit <code>${escapeHtml(run.pushCommit)}</code><br><a href="${escapeHtml(pushUrl)}" target="_blank" rel="noreferrer">Open branch on GitHub</a>` : escapeHtml(run.pushError ?? (run.pushStatus === 'queued' || run.pushStatus === 'pushing' ? 'The reviewed branch is being pushed by your local runner.' : ''))}</p><p>The default branch is not changed or merged.</p></section>` : '';
  return `<section class="detail-current"><span class="run-status status-${escapeHtml(run.state)}"><i class="status-dot"></i>${escapeHtml(humanState(run.state))}</span><span class="detail-provider">${escapeHtml(provider)} selected</span><p>${escapeHtml(repairSummary)}</p></section><section class="dialog-section"><div class="detail-label">REQUESTED CHANGE</div><p>${escapeHtml(run.task)}</p></section>${target}<section class="dialog-section"><div class="detail-label">FIXED OBJECTIVE · SHA-256 ${escapeHtml(run.objectiveHash)}</div><p class="objective-lock">⌑ ${escapeHtml(run.objective)}</p></section><section class="dialog-section"><div class="detail-label">WORKTREE DIFF · ${escapeHtml(run.diffStat || 'No changes')}</div>${diff}</section>${attempts}<section class="dialog-section"><div class="detail-label">TIMELINE</div>${events}</section>${pushed}`;
}

async function refreshOpenDetails() {
  if (detailRefreshPending || !detailDialog.open || !openDetailsRunId) return;
  const requestedId = openDetailsRunId;
  detailRefreshPending = true;
  try {
    const { run } = await api(`/api/runs/${requestedId}`);
    if (!detailDialog.open || openDetailsRunId !== requestedId) return;
    const body = $('#detail-body');
    const next = renderDetails(run);
    if (body.innerHTML !== next) {
      const scrollTop = detailDialog.scrollTop;
      body.innerHTML = next;
      detailDialog.scrollTop = scrollTop;
    }
    $('#detail-refresh-state').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · live while open`;
  } catch {
    if (detailDialog.open && openDetailsRunId === requestedId) $('#detail-refresh-state').textContent = 'Update delayed · retrying automatically';
  } finally { detailRefreshPending = false; }
}

async function showDetails(id) {
  openDetailsRunId = id;
  $('#detail-refresh-state').textContent = 'Loading latest run record…';
  detailDialog.showModal();
  await refreshOpenDetails();
}

runsElement.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'details') await showDetails(id);
    if (action === 'repair') {
      const provider = agentName(lastRuns.find((run) => run.id === id)?.agentId ?? 'codex');
      if (!confirm(`Send this recorded Kane failure and the original task to ${provider} in an isolated worktree?`)) return;
      await api(`/api/runs/${id}/repair`, { method: 'POST' });
      showNotice(activeSession?.mode === 'google' ? `Repair queued for your local runner. ${provider} will receive the recorded failure; the objective remains unchanged.` : `Repair started. ${provider} received the recorded Kane failure; the objective remains unchanged.`);
      await loadRuns();
    }
    if (action === 'verify') {
      await api(`/api/runs/${id}/verify`, { method: 'POST' });
      showNotice(activeSession?.mode === 'google' ? 'The unchanged objective is queued for your local runner.' : 'Kane is rerunning the original objective against the repaired worktree.');
      await loadRuns();
    }
    if (action === 'push') {
      if (!confirm('Create a local commit and push the verified repair to a new patchloop/repair branch? This will not change or merge into the default branch.')) return;
      await api(`/api/runs/${id}/push`, { method: 'POST' });
      showNotice(activeSession?.mode === 'google' ? 'Push queued for your local runner. PatchLoop will report the branch result here.' : 'Pushing the verified repair to a new GitHub branch.');
      await loadRuns();
    }
  } catch (error) { showNotice(error.message, true); }
});

$('#close-dialog').addEventListener('click', () => detailDialog.close());
detailDialog.addEventListener('close', () => { openDetailsRunId = null; });
detailDialog.addEventListener('click', (event) => { if (event.target === detailDialog) detailDialog.close(); });
$('#sign-out').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    location.reload();
  } catch (error) { showNotice(error.message, true); }
});

async function initialize() {
  try {
    activeSession = await api('/api/session');
    if (activeSession.mode === 'google' && !activeSession.authenticated) {
      document.body.dataset.screen = 'signin';
      $('#sign-in-screen').hidden = false;
      $('#app-main').hidden = true;
      if (activeSession.authReady === false) {
        $('.google-sign-in').hidden = true;
        $('#sign-in-error').hidden = false;
        $('#sign-in-error').textContent = 'Google sign-in is not configured yet. The site owner must add the OAuth client ID and secret in Render.';
        $('.privacy').innerHTML = '<i></i> Setup pending';
      } else $('.privacy').innerHTML = '<i></i> Sign in required';
      return;
    }
    document.body.dataset.screen = 'workbench';
    $('#sign-in-screen').hidden = true;
    $('#app-main').hidden = false;
    if (activeSession.mode === 'google') {
      const identity = activeSession.user?.name || activeSession.user?.email || 'Google account';
      $('#session-bar').hidden = false;
      $('#signed-in-user').textContent = `Private session · ${identity}`;
      $('.privacy').innerHTML = '<i></i> Private session';
      if (!activeSession.executionEnabled) {
        $('#hosted-notice').hidden = false;
        $('#submit-run').disabled = true;
        $('.form-hint').textContent = 'Live Kane and agent runs are waiting for the isolated hosted worker.';
        $('#setup-title').textContent = 'Hosted runner';
        $('.privacy-note span:last-child').textContent = 'Your run records are scoped to your Google account. Task execution is turned off for this deployment.';
      } else {
        $('#worker-connect').hidden = false;
        $('#setup-title').textContent = 'Your local runner';
        $('.form-hint').textContent = 'Runs on your computer with your Kane and selected agent sign-ins.';
        $('.privacy-note span:last-child').textContent = 'Task execution and provider sign-ins stay on your computer. Only run history and review evidence sync to your private session.';
      }
    }
    await Promise.all([loadPreflight(), loadTargets(), loadRuns()]);
    if (activeSession.mode === 'google') setInterval(() => { void loadRuns(); void loadPreflight(); void loadTargets(); }, 3000);
    if (activeSession.mode === 'local') setInterval(() => { void loadRuns(); }, 1800);
  } catch (error) {
    document.body.dataset.screen = 'signin';
    $('#sign-in-screen').hidden = false;
    $('#app-main').hidden = true;
    $('#sign-in-error').hidden = false;
    $('#sign-in-error').textContent = `PatchLoop could not load your session: ${error.message}`;
  }
}

counts();
void initialize();
