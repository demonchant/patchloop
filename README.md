# PatchLoop

**A local workbench for turning a real browser failure into a reviewed agent repair and a same-objective Kane rerun.** PatchLoop keeps the acceptance objective fixed, runs changes in a separate Git worktree, and lets the actual Kane CLI result control the verification state.

> **Provenance:** The owner says PatchLoop was built for this hackathon. The local record also contains an October 9 verification run, before the November 12 kickoff. The exact chronology is unresolved; see [event readiness](docs/event-readiness.md). Do not treat the November Git initialization as proof that all code was first written during the event.

## How the loop works

1. Describe the requested change and a browser acceptance objective.
2. PatchLoop hashes the objective, creates an isolated worktree, and starts a fresh copy of the selected target app.
3. Kane CLI runs the objective in a real browser. PatchLoop records the final NDJSON event, process exit code, objective hash, and run output.
4. A first failure must be replayed. If the same objective fails in two consecutive Kane runs, review the evidence and choose **Send repeated failure to Codex**. Codex receives the original request and failure output in the worktree; it cannot change the saved objective through PatchLoop.
5. Review the worktree diff and rerun the same objective with Kane. PatchLoop reports `verified` only when it observes a passing final Kane event and zero exit status.

An inconclusive run, missing tool, timeout, or launch error never becomes a pass. Repairs require a human click and are limited to two attempts per task. Changes remain isolated; download the diff to review or apply it yourself.

## Run locally

Requirements: Node.js 20+, Git, Chrome, `@testmuai/kane-cli`, and Codex CLI. Both command line tools must be installed and authenticated through their own login flows.

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:4173`. The first preflight creates a private copy of the bundled demo task app and initializes it as a local Git repository. The demo starts empty; it is a real small app with a JSON-backed task list, not a fabricated run or result.

```powershell
npm run check
npm test
```

### Kane and Codex setup

```powershell
npm install -g @testmuai/kane-cli
kane-cli login --oauth
npm install -g @openai/codex
codex login
```

PatchLoop launches the installed CLIs from the local machine. It does not accept API keys in the browser or `.env`, and it never returns account identity to the UI. If the installed package entry point cannot be found, set the corresponding local environment variable:

```text
PATCHLOOP_KANE_ENTRY=<absolute path to kane-cli.cjs>
PATCHLOOP_CODEX_ENTRY=<absolute path to codex.js>
```

The agent command runs with Codex's workspace-write sandbox and automatic approval review in the PatchLoop worktree. It receives a prompt built from the requested change, the fixed objective hash, and the actual recorded Kane failure. PatchLoop does not auto-merge, commit, push, deploy, or submit changes.

### Docker

Docker provides a reproducible local UI/API runtime and the isolated Playwright browser test image. The authenticated Kane and Codex CLIs remain on the host; Docker does not receive their profiles or credentials. Use the native `npm start` path for an integrated agent/Kane run.

```powershell
docker compose up --build -d patchloop
```

Then open `http://127.0.0.1:4173`. To stop it, run `docker compose down`. State is stored in the local Docker volume `patchloop-state`.

The Docker browser checks use a clean, separate app container and retain the actual report under the ignored `artifacts/playwright/` directory:

```powershell
docker compose --profile test build patchloop-test e2e
docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e e2e
docker compose --profile test down
```

The Docker UI checks exercise the real PatchLoop app and API. They do not invoke Kane or Codex; those live integrations are exercised by the native app path and must be reported separately.

## Use a different target repo

The default is the bundled demo. The form's **Load the bundled demo task** button only fills the change request and acceptance objective; it does not choose or load a repository. To use another app, start PatchLoop with `PATCHLOOP_TARGET_REPO` pointing to a local clone's repository root. The repo must have a commit, a Node `server.mjs` entry point, and `/api/health`; PatchLoop starts that app in an isolated worktree on a fresh port. The app must honor `PATCHLOOP_PORT` and `PATCHLOOP_DATA_DIR` for each isolated run. Uncommitted files are not copied into the worktree: commit or stash the intended baseline first. The demo-kit launcher sets this variable to a disposable local fixture for you; it does not use a GitHub URL.

```powershell
$env:PATCHLOOP_TARGET_REPO = 'C:\path\to\your\app'
npm start
```

PatchLoop binds to loopback by default. Do not expose the agent-execution endpoint to a public network. Run history, local worktrees, and demo data live under `.patchloop/` and are excluded from Git.

## Demo preset

**Requested change:** add archive and restore actions for completed tasks. Archived tasks disappear from Active and appear in Archived. Restoring preserves the title and completed status.

**Acceptance objective:** create “Pay electricity bill”, complete it, archive it, verify it is absent from Active and present in Archived, restore it, then verify it returns to Active as completed.

The preset only fills the two input fields. It creates no run or seeded app data. A demo is complete only after the actual Kane, Codex, and same-objective rerun have been observed on this machine.

## Evidence and current limits

- The product code and private state are local-first; no hosted service or user account is required beyond the native Kane/Codex CLIs.
- `npm test` covers objective hashing, final-event parsing, secret redaction, and state persistence.
- The Playwright suite checks the UI and real local API without fabricating responses. It does not claim the Kane workflow ran.
- Kane output parsing requires a final `run_end` event and zero process exit plus an observed successful result code/status. Unknown event formats fail closed.
- Current worktree repair support is scoped to a Node target whose server honors the documented PatchLoop environment variables. A generic arbitrary-command adapter is not implemented.
- An uncommitted target baseline is not copied; the selected repo must have a clean, committed state before verification.
- Kane is a paid/credited third-party service. A live verification needs a signed-in TestMu AI account, available credits, network access, and a working Chrome installation.
- Codex needs its own valid local sign-in. The product has not been observed to complete a Codex repair until one real task has run successfully.

## Architecture

```text
Browser UI (loopback)
  → Node API + local JSON history
  → Git worktree from configured repo HEAD
  → target Node app on a fresh local port
  → real `kane-cli run --agent --headless`
  → reviewable failure record + fixed objective hash
  → human authorizes Codex repair in that worktree
  → same objective hash, fresh app data, real Kane rerun
  → observed verdict + downloadable diff
```

More detail: [Architecture and threat boundaries](docs/architecture.md), [claim-to-proof ledger](docs/claim-ledger.md), and [verification record](docs/verification.md).

The current event requirements, the owner's provenance statement, and the conflicting dated record are tracked in [Kane hackathon readiness](docs/event-readiness.md). The existing source does not establish a current event-week Kane→Codex→Kane run, two public launch posts, a demo video, or a submission receipt.

For a complete recording kit, use [the demo runbook](demo-kit/START-HERE.md). It prepares a disposable target with one disclosed regression so the real Kane → Codex → Kane loop can be demonstrated without adding a feature to PatchLoop.

### Public showcase target

The separate [PatchLoop Full Showcase app](https://github.com/demonchant/patchloop-full-showcase) is a small target repository with one intentionally seeded restore regression. Clone it locally, set `PATCHLOOP_TARGET_REPO` before starting PatchLoop, choose it in the repository selector, then record the same objective failing, receiving a human-approved Codex repair, and passing on Kane's replay. The showcase README documents the exact setup and acceptance case. A seeded defect is not evidence of a repair; report a successful loop only after capturing an actual run.

For a temporary read-only URL, follow the [Quick Tunnel instructions](demo-kit/START-HERE.md#temporary-live-url-optional). The PatchLoop executor remains local.
