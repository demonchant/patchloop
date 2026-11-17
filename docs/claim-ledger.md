# Claim-to-proof ledger

| Claim | Observable behavior | Failure behavior | Evidence/check | Status |
|---|---|---|---|---|
| Kane verifies a browser flow | Installed Kane CLI receives fixed objective and target URL; final event and exit code are parsed | Missing event, nonzero exit, timeout, or spawn failure stays non-green | Native run record; Kane local evidence pack | Implemented; live PatchLoop task not yet observed |
| Agent receives a real failure | Human-triggered Codex call contains recorded Kane output, unchanged objective/hash, and requested task | No actual failed attempt or no changed files becomes an error; no success is inferred | Agent attempt and worktree diff hash | Implemented; live repair not yet observed |
| Same acceptance condition is rerun | Objective text/hash remain attached to each Kane attempt and the rerun uses that saved objective | A changed hash would fail review; uncertain Kane state is inconclusive | Run record and `npm test` parser/hash checks | Implemented; live repair/rerun not yet observed |
| Agent edits are isolated | Git worktree starts from target HEAD and is preserved for inspection | Uncommitted target changes are excluded; invalid target root fails setup | Git worktree implementation and target diff | Implemented; live repair not yet observed |
| History survives restart | JSON state is atomically replaced and reloaded by a fresh `Store` | Invalid JSON produces server error; no green fallback | `node --test` persistence check | Verified locally by unit test |
| Docker browser suite exercises real app/API | Playwright service reaches separate PatchLoop container over Compose network | Container tests do not invoke host Kane/Codex | Compose E2E report and health check | Pending Docker run |
| App is local-first | Loopback default, local JSON and worktree directories | Docker integration is limited to UI/API; public exposure is unsupported | Config/code review | Implemented; not a penetration test |
