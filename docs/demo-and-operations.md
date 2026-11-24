# PatchLoop: problem, workflow, and demo

## The problem PatchLoop solves

Coding agents can produce code changes faster than a person can check every browser flow. A successful-looking code diff does not prove the requested behavior works, and a failed browser run can be lost or rewritten while someone tries to repair it. PatchLoop keeps the requested browser outcome fixed, records what Kane actually observed, and gives a human a reviewable repair path.

PatchLoop is the evidence and orchestration layer around two user-owned command line tools:

- **Kane CLI** opens a real browser and checks the acceptance objective.
- **Codex CLI** can propose a code repair after a repeatable Kane failure.
- **PatchLoop** records the task, fixed objective hash, attempts, outcomes, and diff; it decides verification from Kane's actual final result and exit status.

PatchLoop does not claim a pass from an agent's explanation, an incomplete run, a timeout, or a launch error. A repair needs a human action, stays in an isolated Git worktree, and must pass the same saved objective on a fresh run. After that verified pass, a second explicit user action can commit the repair locally and push a new `patchloop/repair-<id>` branch. PatchLoop does not push to the default branch, merge, deploy, or submit the repair.

## Multi-agent repair operations

Each task saves a fixed coding-agent ID. The runner reports a sanitized capability list to the PatchLoop session; provider sign-in identities and credentials remain local. Available command-line adapters are Codex, Claude Code, Cursor CLI, GitHub Copilot CLI, and Kiro CLI. The **Windsurf / custom MCP client** option uses a local MCP server: PatchLoop does not launch Windsurf or treat MCP as a model. The user starts the IDE agent and connects it to the PatchLoop stdio server.

The provider is selected when a task is created and cannot be changed by a later runner report. After the repeatability gate and human repair action, the selected agent receives the recorded task, fixed objective, Kane failure, and isolated worktree. PatchLoop records the provider/version, exit status, bounded output, and actual worktree diff. Agent completion is not verification; Kane must pass the same saved objective on a fresh run.

### Provider setup

Install and sign in to the provider on the computer running the local app or paired worker. PatchLoop checks the tools locally. Use each provider's own installer and sign-in process.

| Provider | Local setup | Repair path |
| --- | --- | --- |
| Codex | Install `@openai/codex` and sign in with `codex login`. | Ephemeral `codex exec` in the isolated worktree. |
| Claude Code | Install `claude` and sign in locally. | Headless prompt with explicit Read, Edit, and Write tools. |
| Cursor | Install the Cursor CLI (`agent`) and sign in with `agent login`. | Headless prompt in the isolated worktree. |
| GitHub Copilot | Install `copilot` and sign in with Copilot or GitHub CLI. | Programmatic prompt with read/write tool availability and assisted approval. |
| Kiro | Install `kiro-cli` and sign in locally. Headless use may require `KIRO_API_KEY`. | Noninteractive chat with explicit file read/write tools. |
| Windsurf / custom MCP client | Set `PATCHLOOP_MCP_BRIDGE_ENABLED=true` on the runner and configure the IDE to start `node mcp-server.mjs` from the PatchLoop checkout. | The IDE calls `patchloop_get_repair_context` and `patchloop_finish_repair`; the bridge is bound to the active run and cannot mark it verified. |

The MCP server and worker must share a data directory. For the paired worker, set `PATCHLOOP_DATA_DIR` in the IDE's MCP configuration to the same `.patchloop/remote-worker` directory the worker uses. The bridge accepts no browser-supplied command, URL, worktree, or acceptance objective. The IDE agent edits the provided worktree with its own workspace tools; PatchLoop computes the diff and runs Kane independently.

On Windows, npm-installed command shims are started through a fixed PowerShell launcher. The selected CLI argument list is passed as JSON separately from the launch script, so browser text is not interpolated into shell source. Executable names and arguments come from the runner-owned adapter registry.

### Live details and GitHub review

While **Details** is open, PatchLoop requests the latest saved run record on each run-list refresh. The panel updates status, provider result, diff summary, Kane attempts, and event timeline without closing. The visible **×** closes the panel. A hosted page can display only progress that the paired runner has successfully reported.

For a GitHub target, a successful same-objective Kane rerun enables **Push repair branch** after the user reviews and confirms. The runner checks that the worktree still matches the displayed diff, commits locally, and pushes a non-force `patchloop/repair-<id>` branch. It does not merge or change the default branch.

## How the service works

There are two ways to use PatchLoop:

1. **Hosted site with a local runner.** The website at [patchloop-web-f9wj.onrender.com](https://patchloop-web-f9wj.onrender.com) provides Google sign-in, a private account session, and a queue. A small worker on the user's computer polls that queue and runs Kane/Codex locally. Provider CLI credentials, target source, and worktrees stay on that computer. A GitHub URL, task text, progress, redacted evidence, and the reviewable diff are sent to the user's hosted session.
2. **Integrated local workbench.** The user runs the web app on loopback and it invokes the locally installed CLIs directly. Run history and worktrees remain under the ignored `.patchloop/` directory on that computer.

The hosted service does not provide Kane credits or Codex access. Every worker user must have working local Kane CLI access/credits and Codex CLI signed into their own ChatGPT account. The project owner pays Render hosting and storage. The runner must remain online while a task is being processed.

## Hosted user workflow

### One-time setup on the computer that will run tasks

Requirements: Windows, macOS, or Linux with Node.js 20+, Git, Chrome, a network connection, a signed-in Google account, Kane CLI access/credits, and Codex CLI access through ChatGPT sign-in. GitHub CLI is optional for direct links and required for the account repository picker and authenticated pushes.

Clone PatchLoop's repository onto the local runner computer. Target repositories can be selected from a connected GitHub CLI account, pasted as a GitHub link, or configured as a local checkout:

```powershell
cd $HOME
git clone --branch main https://github.com/demonchant/patchloop.git
cd $HOME\patchloop
npm ci
npm install -g @testmuai/kane-cli @openai/codex
kane-cli login --oauth
codex login
codex login status
gh auth login
gh auth setup-git
```

GitHub CLI is optional if you use the direct link field for a public repository. Its sign-in lets PatchLoop list up to 100 repositories from the authenticated-user repositories API, including owner, collaborator, and organization-member repositories. `gh auth setup-git` configures Git's credential helper for private clones and pushes. Review each target's code and `patchloop.target.json` first: PatchLoop runs target manifest commands locally. A GitHub run fetches the latest default-branch commit when verification starts, then creates an isolated worktree from that commit. These CLI logins happen locally. Do not paste provider passwords, tokens, pairing codes, or auth files into the website, repository, video, or Render settings.

### Pair the local runner and register the target

1. Open [https://patchloop-web-f9wj.onrender.com](https://patchloop-web-f9wj.onrender.com) and sign in with Google.
2. Choose **Connect local runner**. Keep the one-time command displayed by the site private; it expires after ten minutes and works once.
3. In PowerShell, change to the PatchLoop checkout. If using a manually cloned local target instead of a GitHub link or repository picker, set `PATCHLOOP_TARGET_REPO` in this same terminal:

   ```powershell
   cd $HOME\patchloop
   # Optional local target only; GitHub link/picker users can omit this.
   $env:PATCHLOOP_TARGET_REPO = 'C:\path\to\your\target-checkout'
   ```

   The local target path is optional when selecting from GitHub or entering a GitHub link. Keep it set only when intentionally using a local checkout.

4. Run the first-time pairing command copied from PatchLoop, in this same terminal:

   ```powershell
   npm run worker -- --url https://patchloop-web-f9wj.onrender.com --pair-code <ONE_TIME_CODE_FROM_PATCHLOOP>
   ```

   The worker saves a revocable local token under the ignored `.patchloop/remote-worker/` folder. It prints the number of ready repository targets and GitHub repositories it can list. If GitHub is connected but its count is zero, check the GitHub CLI account and repository visibility.

5. Leave the worker terminal open. Confirm the website says the runner is connected, refresh the page, and choose **PatchLoop Full Showcase** or another listed repository in **Target repository**. A direct GitHub repository link can also be pasted into the run form. Pairing and GitHub sign-in are separate; a connected runner does not imply GitHub is connected.
6. Create the requested code change and browser objective. The task describes what the agent should change. The acceptance objective must state the observable browser behavior Kane will check. For the showcase, copy the task and fixed objective from its README.
7. Submit the task, monitor the timeline, then open **Details** to inspect the fixed objective hash, Kane evidence, final event, exit code, and diff. A setup error means the runner or target configuration needs attention; it is not a Kane failure and should not be sent to Codex.
8. After two consecutive failures of the same objective, inspect the evidence and explicitly request a Codex repair if appropriate. Review the actual worktree diff, then run the unchanged objective with Kane again. Claim a successful repair only when a real diff exists and the final same-objective Kane run passes with a successful process exit.
9. For a verified repair on a GitHub target, review the diff and select **Push repair branch** only when you want to publish it. PatchLoop asks for confirmation, commits locally, and pushes a non-force `patchloop/repair-<id>` branch. Git author name/email and GitHub write access must be configured on the runner. The default branch is not changed; opening or merging a pull request is a separate GitHub action.

For future worker starts, set `PATCHLOOP_TARGET_REPO` again in each new terminal only if you use a local checkout, then omit the already-used pairing code:

```powershell
cd $HOME\patchloop
# Optional only for an already-cloned local target:
# $env:PATCHLOOP_TARGET_REPO = 'C:\path\to\your\target-checkout'
npm run worker -- --url https://patchloop-web-f9wj.onrender.com
```

To disconnect and revoke this worker pairing, run `npm run worker -- --url https://patchloop-web-f9wj.onrender.com --disconnect` from the PatchLoop checkout. If a configured local target is absent, restart the worker after correcting its path or manifest. Existing run records keep their original target and objective.

Pairing codes expire after 10 minutes and can be used once. Never publish a code in a README, screenshot, issue, or commit. The worker saves a revocable local token under `.patchloop/remote-worker/`, which is ignored by Git. After first pairing, restart it with:

```powershell
npm run worker -- --url https://patchloop-web-f9wj.onrender.com
```

To stop and revoke the local worker pairing:

```powershell
npm run worker -- --url https://patchloop-web-f9wj.onrender.com --disconnect
```

If the worker terminal closes, the computer sleeps, or the network drops, queued work waits until the worker reconnects. A user's history and runner are scoped to their Google account; do not assume hosted multi-account isolation is independently proven until the documented live account-separation check has been recorded.

### Starting the local workbench instead

For a local-only session, in the repository root run:

```powershell
npm ci
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The bundled task app is prepared under `.patchloop/` on first use. Install and authenticate Kane/Codex using the setup above if you want real verification and repair. To preserve local run history and worktrees, do not delete `.patchloop/`.

To use the showcase app locally, set `PATCHLOOP_TARGET_REPO` to its committed checkout before `npm start`, then choose it from the same picker.

For Docker UI/API and browser checks, follow the commands and limitations in [verification](verification.md) and [deployment](deployment.md). Docker Playwright checks do not authenticate or run Kane/Codex; use the native or hosted worker path for those real integrations.

## Competition submission checklist

The current event page calls for a public GitHub repository, a 3–5 minute YouTube demo, project/agent/Kane details, and at least two public project posts. It lists a November 26, 2026 deadline. Check the [official organizer page](https://www.kaneclihack.sh/) and submission form for current requirements and eligibility. A GitHub push is not the event submission; save the actual form receipt separately.

This repository's history predates the event build window described in the supplied materials. Do not claim it was built during the event or that it meets that timing requirement. Ask the organizer whether this history is eligible before submitting. The private event pass, personal preparation packet, and personal build guides are intentionally not part of this repository.

## Screen recording and narration

The edited local QA recording shows showcase target selection, Kane's status changing from Running to Verified, the passed run details, and the signed-out screen. The run reports result code `100`, `success.complete`, and exit `0`, with no worktree diff. It demonstrates the Kane verification result, not a Codex repair of the seeded showcase defect.

| Time | What to show | Voiceover |
|---|---|---|
| 0:00-0:25 | Workbench and showcase restore requirement. | Explain that an archived completed task should restore with its title and checked state, and why a diff alone is not browser proof. |
| 0:25-0:50 | Select the showcase target and show the fixed objective. | Explain the two local clones: PatchLoop's runner and the separate app repository being tested. |
| 0:50-1:12 | Show the actual missing-target setup error. | Explain that the worker could not find the target because `PATCHLOOP_TARGET_REPO` was missing. |
| 1:12-1:30 | Show the target configuration steps. | Explain setting the variable in the worker terminal, restarting it, and confirming both repositories are registered. |
| 1:30-1:50 | Show Kane starting the browser run. | Explain that PatchLoop hashes and preserves the same acceptance objective. |
| 1:50-2:20 | Show Kane's passing final event and the no-diff field. | State the observed result code and exit status; make clear that no Codex diff is shown. |
| 2:20-2:23 | Show the setup guide. | Point viewers to the public source and target repositories and complete setup instructions. |

Do not show credentials, pairing codes, account details, unrelated browser tabs, or raw CLI auth data. Add the video URL to the organizer's form only after the recording exists, plays correctly, and its claims match the run record.

## Recorded verification evidence

The committed [verification record](verification.md) reports the automated and earlier local results below. The edited local QA recording separately shows a Kane run and its limitations:

- `npm.cmd run check` passed.
- `npm.cmd test` passed (11 tests) on October 10, 2026, including a showcase manifest launch/health test with a local test CLI stub (not Kane evidence).
- Docker Playwright passed (11 tests) on October 10, 2026, including picker selection and stale-target rejection.
- The showcase HTTP smoke check reproduced the intentional `completed: false` restore regression; it did not run Kane or Codex.
- The edited local QA recording shows the run move from Running to Verified, with result code `100`, `success.complete`, exit `0`, and no code diff. It ends on the signed-out screen and does not demonstrate a Codex repair.
- Kane run `db0ac6a2-2929-442f-a383-8e20d153ee28` passed the archive/restore objective with result code `100` (`success.complete`) and process exit `0`.
- Earlier attempts `87ec7a34-99f2-4625-b63f-621de1d078b3` (failed) and `704c51dc-3e5e-490a-a049-0b881ad4a1a2` (timed out/inconclusive) remain distinct from that passing run.

These records show the app's local behavior and test coverage. They do not establish broad compatibility, a hosted end-to-end Kane/Codex run, or event eligibility.
