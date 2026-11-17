# Verification record

This file is updated only with commands actually run. Pre-event Kane smoke runs against TestMu's public marketing page are documented privately in `preparation/evidence/pre-event-kane-smoke.md`; they are not PatchLoop evidence.

## Commands

The first block below is historical pre-event evidence retained as recorded. It was not rerun on November 17. The second block records checks actually attempted during this review.

| Command | Result | Scope / limitation |
|---|---|---|
| `npm.cmd run check` | Passed | Syntax checks for server, engine, store, browser script, and demo server. |
| `npm.cmd test` | Passed (5 tests) | Deterministic hash/parser/redaction/store checks. |
| Focused Playwright archive/restore check | Passed | Repaired app worktree with isolated task data; checked Active/Archived visibility and retained completion state. |
| `docker compose --profile test run --build --rm -e TEST_OUTPUT_DIR=/tmp/patchloop-results -e TEST_HTML_REPORT=/tmp/patchloop-report e2e` | Passed (6 tests) | Docker Playwright suite includes the bundled demo archive/restore workflow. Test containers had no Kane or Codex credentials. |
| Kane verification | Passed on run `db0ac6a2-2929-442f-a049-0b881ad4a1a2` | Same acceptance objective and hash as run `87ec7a34-99f2-4625-b63f-621de1d078b3`; baseline commit `4d0adbffa80f63cb52f5b86ce4a6736837e610d0`; Kane CLI `0.8.21`; exit code `0`; result code `100` (`success.complete`); timeout `900` seconds. |

## Review checks (2026-11-17)

| Command | Result | Scope / limitation |
|---|---|---|
| `npm.cmd run check` | Passed | Syntax checked server, engine, engine tests, store, process helpers/tests, repeatability, browser script, and demo server. |
| `node --test --test-isolation=none --test-concurrency=1` | Passed (7 tests) | Single-process workaround for this sandbox's `EPERM` when Node's default test runner spawns workers. Includes busy-lock and interrupted-run recovery tests. |
| `npm.cmd test` | Could not run here (`spawn EPERM`) | Node test runner failed while spawning its worker, before executing tests. |
| `npm.cmd run test:e2e` | Could not run here (`spawn EPERM`) | Playwright failed to spawn before executing browser tests; no current E2E result. |
| Demo-kit launcher and health request | Partial pass | `demo-kit/start-demo.ps1` created a disposable seeded target and started PatchLoop on a free loopback port; `GET /api/health` returned 200. The preflight endpoint returned 500 because this sandbox blocks child-process launch (`spawn EPERM`); no Kane/Codex readiness is claimed. |
| PatchLoop Kane→Codex→Kane flow | Not run | Requires authenticated local Kane and Codex CLIs and current event-period evidence. Historical October run is not event proof. |

## Archive/restore evidence (2026-10-09)

The immutable acceptance objective hash was `fedc6133ab58b946870581fd309da2e07df369f99dcac9ab26abe1e57c734916` for all three runs below.

| Run ID | Result | Evidence |
|---|---|---|
| `87ec7a34-99f2-4625-b63f-621de1d078b3` | Failed; retained as `needs_review` | Kane selected the Completed tab after checking the task, so archive and restore were not attempted. |
| `704c51dc-3e5e-490a-a049-0b881ad4a1a2` | Timed out; retained as `inconclusive` | Kane archived the task and opened Archived, but the 435-second integration timeout expired before restore and final assertions. |
| `db0ac6a2-2929-442f-a383-8e20d153ee28` | Passed; `verified` | Final `run_end`: `passed`; result `100`; reason `success.complete`; task data records `completed: true`, `archived: false`. Kane confirmed it disappeared from Active while archived, appeared in Archived, and returned to Active with the completion checkmark. |

The repair is now part of `demo-template` and the committed private baseline used to create new worktrees. Run records and acceptance objectives were preserved; the passing result is a new run rather than an edited prior record.

## Evidence fields for a real loop

For each actual attempt, record UTC time, repository HEAD, Kane/Codex versions, exact objective hash, actual CLI exit codes, Kane `run_end` result code/reason, agent diff hash, and outcome. Do not copy signed dashboard URLs, auth identity, or credentials into this repository.
