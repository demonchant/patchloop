# PatchLoop validation results

## Latest run

- Date: 2026-11-24
- Platform: Windows; Node.js 24.18.0; npm 11.16.0
- Syntax validation: `npm run check` - passed.
- Node test suite: `npm test -- --test-reporter=spec` - 19 passed, 0 failed.
- Playwright browser suite: `npm run test:e2e` - 15 passed, 0 failed.
- Playwright used isolated local ports to avoid unrelated listeners on the default ports.

## Saved outputs

- [`runner-recovery/syntax-check.log`](runner-recovery/syntax-check.log) - syntax-check command output.
- [`runner-recovery/node-test.log`](runner-recovery/node-test.log) - full Node test results, including assignment-lease recovery and rejection of stale reports.
- [`runner-recovery/playwright-test.log`](runner-recovery/playwright-test.log) - full browser-suite output.
- [`runner-recovery/playwright-report/index.html`](runner-recovery/playwright-report/index.html) - browsable Playwright report.
- [`runner-recovery/e2e-artifacts/`](runner-recovery/e2e-artifacts/) - browser test metadata for the run.
- [`playwright-test-final.log`](playwright-test-final.log) and [`playwright-report-final/index.html`](playwright-report-final/index.html) - previous passing browser suite.

The provider argument-builder test covers the registered CLI command/argument policies. The Codex adapter is exercised with a local fake CLI executable, and the MCP test starts PatchLoop's actual local stdio server and completes a run-bound handoff. The latest suite covers runner report recovery and stale-assignment rejection, a bounded retry for the recorded Windows Codex argument parsing failure, live Details refresh with stale-runner messaging, Kane verification of a saved diff after an agent process error, and the bundled archive/restore flow.

Earlier diagnostic outputs remain in the local workspace; the published result set here is the final passing run.
