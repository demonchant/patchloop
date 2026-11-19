# PatchLoop

**A local workbench for turning a repeatable browser failure into a reviewed agent repair and a same-objective Kane rerun.** PatchLoop stores the task and run record locally. Kane, Codex, the target app, and the repair worktree run on the computer paired to the workbench.

## What works

1. Save a change request and a fixed browser objective. PatchLoop stores the objective's SHA-256 hash.
2. Run Kane against a committed target repository in an isolated Git worktree and a fresh app data directory.
3. Replay the same objective. PatchLoop requires two matching Kane failures before it offers the Codex repair action.
4. Approve Codex manually. Codex edits the isolated worktree; PatchLoop keeps the diff for review.
5. Run Kane again against that same worktree and unchanged objective. Only exit code `0` plus a successful final `run_end` event can set the run to `verified`.

An inconclusive run, missing event, timeout, output overflow, or setup error cannot become a pass. PatchLoop does not commit, merge, publish, deploy, or submit the repair. The sample app deliberately contains a disclosed restore regression; it is a test fixture, not proof that a real Kane/Codex loop has run.

## Run locally

Requirements: Node.js 20+, Git, Chrome, the Kane CLI, and the Codex CLI. Authenticate Kane and Codex using their own local login flows. PatchLoop does not accept their credentials in the browser or `.env`.

```powershell
npm ci
npm run check
npm test
$env:PATCHLOOP_TARGET_REPO = (Resolve-Path .\examples\patchloop-full-showcase2).Path
npm run test:e2e
npm start
```

Playwright uses the pinned `@playwright/test` package. If its matching browser is not installed, run `npx playwright install chromium` once.

Set `PATCHLOOP_TARGET_REPO` to a committed, trusted target checkout before starting. The separate showcase target is published at [demonchant/patchloop-full-showcase2](https://github.com/demonchant/patchloop-full-showcase2). In a published PatchLoop checkout, clone that target separately and set the variable to its path. See [setup and operations](docs/operations.md) for first-run steps and the optional remote runner mode.

## Security and trust boundaries

- Local mode binds to loopback and stores state under `.patchloop/`.
- Hosted mode (optional) stores account-scoped run records on one service instance; the local worker keeps provider sign-ins, target paths, source, and worktrees on its machine.
- A target repository is executable code. Its reviewed `patchloop.target.json` install/start commands run with the local operating-system account.
- Codex receives repeated failure evidence and works in a detached Git worktree. Review its diff before applying it.
- Kane output is accepted only when its final one-shot `run_end` event reports `status: passed` and the process exits `0`.
- Runner reports are checked against the saved objective and successful final Kane event. This is an integrity check between the paired worker and service, not cryptographic proof against a compromised worker.

## Documentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Setup and operations](docs/operations.md)

## Current evidence limits

Local automated tests cover the worktree replay/repair lifecycle with test-only fake CLI processes, persistence/report invariants, parsing, and the intentionally seeded sample regression. These fixtures do not count as Kane verification or closed-loop event evidence. A credentialed Kane → human-approved Codex → Kane run, hosted deployment, YouTube recording, two public launch posts, and submission receipt have not been observed in this workspace. The main project is published at [demonchant/patchloop](https://github.com/demonchant/patchloop), and the separate sample target is published at [demonchant/patchloop-full-showcase2](https://github.com/demonchant/patchloop-full-showcase2).

A repository push alone is not an event submission.
