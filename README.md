# PatchLoop

**An AI coding agent says, “It’s fixed.” PatchLoop asks the browser.**

PatchLoop is a developer workbench for turning a real browser failure into a reviewable repair and a second run of the exact same acceptance check. Kane CLI observes what happened in the browser. Codex can work on the failure in an isolated Git worktree. PatchLoop keeps the requested behavior fixed and lets Kane’s recorded result—not an agent’s confidence—decide whether the flow passed.

## The moment PatchLoop is for

You ask a coding agent to repair a checkout, restore a task, or finish a settings flow. The diff looks reasonable. The agent says it is done. Then someone opens the app and discovers that the completed task comes back unchecked, the cart is empty after refresh, or a button only works along the path the agent happened to try.

That gap is expensive because the person reviewing the change must reconstruct the requirement, repeat the journey, and decide whether a red result is a product bug or a flaky check. The code-writing agent is also a poor judge of its own work: it can change the implementation and quietly change what “passing” means.

PatchLoop makes that handoff visible. It saves the browser outcome before repair, preserves the acceptance objective, asks for human approval before sending a repeatable failure to Codex, and runs Kane again against the unchanged objective. The reviewer can follow the request, failure, repair diff, and final browser verdict in one history.

## How the repair loop works

```text
Describe the change and its user-visible acceptance objective
                         ↓
PatchLoop hashes the objective and creates an isolated Git worktree
                         ↓
Kane drives the target app in a real browser and records its result
                         ↓
If the same objective fails twice, a person reviews the evidence
                         ↓
With approval, Codex receives the request and real failure output
                         ↓
The person reviews the worktree diff
                         ↓
Kane reruns the same saved objective against the repair
                         ↓
PatchLoop marks “verified” only from Kane’s passing final event and exit code 0
```

The first failure is not enough to trigger a repair. PatchLoop requires two consecutive failures for the same objective before offering Codex. An inconclusive run, timeout, missing event, setup error, or failed process stays non-green. Repairs are human-triggered, isolated, and limited to two attempts per task. After Kane verifies a repair, the user can separately approve a GitHub push. PatchLoop commits that repair to a new `patchloop/repair-<id>` branch; it never changes the default branch, merges, deploys, or submits the change.

## What makes the result reviewable

- **The acceptance objective is fixed.** PatchLoop stores its SHA-256 hash with each Kane attempt. Codex may edit the worktree, but the PatchLoop workflow does not let it replace the saved check.
- **A failure is preserved before repair.** The recorded Kane event, process exit code, objective hash, and bounded output remain part of the task history.
- **Uncertainty stays visible.** A timeout or malformed/missing final event is inconclusive; it is never presented as a pass.
- **The code change is inspectable.** Codex works in a detached Git worktree, and PatchLoop retains a downloadable diff for human review.
- **Verification is independent of the repair agent.** Only Kane’s successful final browser result and process exit code `0` can produce the `verified` state.
- **The local runner owns execution.** The hosted UI queues work; Kane, Codex, Chrome, the target checkout, and worktrees remain on the paired computer. You can paste a GitHub repository link into a run; the paired runner fetches it locally, while the hosted service stores the link with the run record.

## Two ways to use PatchLoop

### Local workbench

Run PatchLoop on your computer at `http://127.0.0.1:4173`. It invokes the locally installed Kane and Codex CLIs directly. Run history, target copies, and worktrees stay in the ignored `.patchloop/` directory.

### Hosted workbench with a private local runner

The hosted service provides Google sign-in, account-scoped run history, and a queue. A runner that you pair from your own computer polls that queue and executes Kane and Codex locally. Your CLI profiles and target source are not uploaded. If you submit a GitHub link, the URL is stored with your run; the runner fetches the code locally. Task text, progress, redacted run evidence, and the reviewable diff are sent to the hosted account so the site can display the run.

Hosted mode requires the runner computer to remain online while a task is processed. The Render service uses a persistent disk and a single instance for its local JSON state and in-memory coordination. See [hosted deployment](docs/deployment.md#hosted-link-with-a-local-runner) before enabling it.

**Hosted preview:** [patchloop-web-f9wj.onrender.com](https://patchloop-web-f9wj.onrender.com). Availability and end-to-end runner operation must be checked before relying on this URL; a web page loading does not prove the runner is connected.

#### Connect GitHub and choose a repository

GitHub access stays on the computer running PatchLoop or its paired worker. Install [GitHub CLI](https://cli.github.com/), then sign into the intended account and configure Git to use that sign-in:

```powershell
gh auth login
gh auth setup-git
```

Restart the paired worker. PatchLoop lists up to 100 repositories returned by GitHub's authenticated-user repositories API in the target picker, including repositories the signed-in account owns or can access as a collaborator or organization member. Choose one, or paste a GitHub repository root link into the form. For a private repository, local GitHub access is required to clone and push. PatchLoop stores the repository link with the private run record; it does not upload the repository source or GitHub credentials. See the [GitHub CLI login](https://cli.github.com/manual/gh_auth_login), [`gh api` pagination](https://cli.github.com/manual/gh_api), [authenticated-user repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user), and [GitHub CLI Git credential setup](https://cli.github.com/manual/gh_auth_setup-git) documentation.

After a Codex repair passes the same Kane objective, review its diff and choose **Push repair branch** to create a local commit and push a new `patchloop/repair-<id>` branch. This requires a configured Git author name/email and GitHub write access. The operation does not merge the branch or alter the default branch; create a pull request yourself if you want to propose merging it.

## Try it locally

Requirements: Node.js 20+, Git, Chrome, Kane CLI, and Codex CLI. Kane and Codex must each be installed and signed in on the computer that will run the task.

```powershell
npm ci
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4173`. The first preflight creates a private copy of the bundled demo task app. It starts empty; PatchLoop does not seed a fake successful run.

Install and sign in to the command-line tools:

```powershell
npm install -g @testmuai/kane-cli
kane-cli login --oauth
npm install -g @openai/codex
codex login
```

Kane runs consume the user’s TestMu AI account credits. Confirm the target repository and available credits before starting a live run.

For the GitHub repository picker and branch push, also install GitHub CLI on the runner computer, run `gh auth login` and `gh auth setup-git`, then restart the worker. A public repository can instead be supplied as a direct link.

## Run the showcase scenario

The bundled showcase target demonstrates a deliberately seeded restore regression. A completed task can lose its completed state after it is archived and restored. The defect is a disclosed fixture, not proof that PatchLoop repaired it.

For the strongest demonstration, show an actual run from a clean start:

1. Select the showcase target and enter the archive/restore request and browser objective.
2. Run Kane and show the observed failure. Replay the unchanged objective and show that its hash matches.
3. Review the repeated failure and explicitly authorize Codex.
4. Inspect the actual worktree diff before rerunning.
5. Run Kane against the same saved objective. Show the actual final event and exit status. If the rerun fails or is inconclusive, show that result as-is.
6. After a verified pass, optionally show the explicit **Push repair branch** action, the resulting `patchloop/repair-<id>` branch, and its GitHub page. This is a separate user-approved push; it does not merge into the default branch.

The step-by-step [demo and operations guide](docs/demo-and-operations.md) explains target setup, hosted runner pairing, and recording. The [target repository guide](docs/target-repositories.md) explains what code PatchLoop executes locally.

## Evidence and current limits

The repository’s [verification record](docs/verification.md) distinguishes automated checks, Kane runs, and the limitations of each. It records local unit and Playwright results, plus an October 9, 2026 Kane archive/restore run that passed with result code `100` (`success.complete`) and exit code `0`. That historical run predates the November hackathon window. It is not evidence of a current event-period PatchLoop → Codex repair → Kane rerun.

The current evidence does **not** establish a credentialed event-period repair loop, hosted end-to-end worker run, broad user validation, or hackathon submission receipt. The archive/restore fixture is intentionally defective, and its seed must be disclosed in any demo. Do not describe a prepared walkthrough, a local UI test, or a passing historical Kane run as a current live repair.

The project’s provenance also needs care: the repository records work and Kane evidence from before the November 12, 2026 event kickoff. The event rules say the submission code must be started during the event. Confirm eligibility with the organizer; a new repository initialization does not change the age of existing code. See [submission notes](docs/submission.md).

## Security and privacy

- Local mode binds to loopback by default. Do not expose the local execution server directly to the public internet.
- Hosted sign-in uses Google OAuth and signed, secure session cookies. Hosted run records are scoped to the signed-in Google account.
- Hosted mode only queues work for paired local runners; it cannot execute local commands on the Render web service.
- Runner pairing uses a one-time, expiring code and a revocable token. Keep `.patchloop/remote-worker/` private.
- GitHub CLI credentials stay on the runner. GitHub URLs and repository metadata are scoped to the signed-in PatchLoop account; a user-triggered push creates a new branch and never changes the default branch.
- Target repositories and their manifest commands are executable code. Pair only a repository you trust and inspect its target manifest first.
- Never commit `.env`, OAuth secrets, runner tokens, CLI profiles, or local run state. The hosted service receives task details, progress, redacted CLI evidence, and repair diffs; avoid placing secrets in task text or code.
- The hosted JSON store and runner coordination are designed for one service instance. Do not scale horizontally without replacing those storage and coordination mechanisms.

## Technology

PatchLoop uses Node.js for the local/hosted HTTP service, a JSON-backed task store, Git worktrees for isolated repair attempts, Kane CLI for real-browser verification, Codex CLI for human-approved repair proposals, and Playwright for browser tests of the app UI. Google OAuth is used only for hosted PatchLoop identity; it does not sign into Kane or Codex.

There is no embedded product AI. Codex performs the bounded code repair; deterministic PatchLoop logic validates run state and decides whether Kane’s evidence qualifies as a pass.

## KaneCLI Online Hackathon

The official KaneCLI Online Hackathon rubric first requires three ship bars: an end-to-end flow, Kane catching or proving something meaningful, and communication between the coding agent and Kane. It then scores four equally weighted criteria—**Ships**, **Verified**, **Closed loop**, and **Craft**—at 25% each. PatchLoop’s implementation maps to them as follows; this mapping describes product behavior, not a score prediction.

| Official criterion | How PatchLoop addresses it | What a judge can inspect |
|---|---|---|
| **Ships (25%)** | A user enters a change and a fixed browser objective, selects a registered GitHub repository or pastes its link, then starts a real Kane run on the paired local runner. | The hosted/local workbench, repository picker, local clone and isolated worktree path in [`engine.mjs`](lib/engine.mjs), and the [target setup guide](docs/target-repositories.md). |
| **Verified (25%)** | Kane—not Codex’s explanation—sets the verdict from its final browser event and process exit code. Failed, missing, timed-out, or inconclusive results stay visible as non-passing. | The recorded Kane attempts and objective hash in each run, plus [verification notes](docs/verification.md). A current event-period run still needs to be recorded. |
| **Closed loop (25%)** | PatchLoop preserves one hashed objective, requires two matching Kane failures before the first repair, asks the user to authorize Codex, records its diff, and runs Kane again against that unchanged objective. A verified repair can then be pushed, with separate approval, to a reviewable GitHub branch. | The task timeline, repeated failures, Codex attempt, diff, unchanged objective, final Kane result, and optional `patchloop/repair-<id>` branch. |
| **Craft (25%)** | The interface makes task state and evidence inspectable; Google sessions isolate hosted run history; GitHub and Kane/Codex credentials stay on the runner; repository code runs in a disposable worktree; pushing is explicit and avoids the default branch. | The workbench, account-scoped hosted flow, [architecture and trust boundaries](docs/architecture.md), and [deployment and recovery guide](docs/deployment.md). |

The rubric also says missing any of the three ship bars prevents scoring the four dimensions. Code and docs alone do not prove a live event-period repair loop: the current [verification record](docs/verification.md) distinguishes historical and automated evidence from a current hosted run. Eligibility and event-period provenance remain separate questions; see [submission notes](docs/submission.md). The official [judging criteria and rules](https://www.kaneclihack.sh/) remain authoritative.

The official page lists a November 26, 2026, 11:59 PM IST deadline and requires a public GitHub repository, a 3–5 minute YouTube demo, project/agent/Kane details, and at least two public project posts. Check the [official event rules](https://www.kaneclihack.sh/) for the current requirements. A repository push is not a submission receipt.

## Project documentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Claim-to-proof ledger](docs/claim-ledger.md)
- [Local and hosted deployment](docs/deployment.md)
- [Target repository contract](docs/target-repositories.md)
- [Demo and operations guide](docs/demo-and-operations.md)
- [Verification record](docs/verification.md)
- [Submission notes](docs/submission.md)
