# Architecture and trust boundaries

## Request path

The browser posts a change request, acceptance objective, and either a registered target ID or a GitHub.com repository-root URL to the Node server. The server validates task text, hashes the exact objective, and only accepts GitHub HTTPS links with an owner/repository path and no credentials, query, or fragment. It does not accept shell commands, CLI flags, output paths, or environment overrides from the browser. For connected-account selection, the local runner uses GitHub CLI authentication and sends repository names, visibility, and clone URLs to that user's private target catalog; GitHub credentials stay on the runner.

The engine resolves a target repository from server environment. Its baseline `HEAD` is materialized as a Git worktree beneath `.patchloop/worktrees/<run-id>`. The selected Node entry point runs from that worktree with a fresh data directory and ephemeral port. The engine waits for the target's `/api/health`, then invokes the installed Kane CLI with the fixed objective and local URL.

In hosted mode, Google login scopes run records and repository catalogs to the Google subject. The Render web service only queues tasks; it never clones or starts target apps, Kane, or Codex. A user pairs a local runner with a one-time ten-minute code. The runner stores its bearer token locally and Render stores only its SHA-256 hash. The runner polls only that user's queue, imports immutable task/objective/repository fields into a local state directory, clones or updates a selected GitHub repository on that computer, executes the existing Engine there, and sends bounded progress, redacted CLI evidence, and the reviewable diff back to the private run record. A runner disconnect marks an in-flight verification as needing review rather than reporting a pass.

Only a final Kane `run_end` event, a successful verdict, and exit code zero set the task to `verified`. A failed final result moves to `needs_review`; malformed output, missing `run_end`, a spawn error, or timeout cannot be green. The user explicitly authorizes a Codex call. Codex receives the task, original objective/hash, and redacted Kane output. It has workspace-write permissions in the isolated worktree. A separate Kane run is required after repair.

## State

`Store` persists JSON at `.patchloop/state.json` by temp-file write and rename. Run events are appended and attempts are recorded separately. This is local persistence, not cryptographic tamper evidence; a local user with filesystem access can alter the file. Each attempt records objective hash, process exit, timestamps, bounded output, and the parsed final event. Tokens and signed URLs are redacted before persistence.

Worktrees are retained for review. After a verified Codex repair, the user can explicitly request a GitHub push. PatchLoop rechecks the diff, creates a local commit using the user's configured Git author, and performs a non-force push to a run-specific `patchloop/repair-<id>` branch. It does not change the default branch or merge the repair. A push requires GitHub write access and remains on the local runner.

## Boundaries and limits

- Default bind: `127.0.0.1`. Docker binds its published port to host loopback.
- Browser writes are same-origin checked; API bodies are size-limited.
- CLI entry points are resolved from known global package locations or explicit local environment overrides. No shell interpolation is used for Codex or Kane.
- Codex may execute code in its sandboxed worktree. Treat a target repository and its scripts as code you trust.
- The Node target contract is `server.mjs`, `/api/health`, `PATCHLOOP_PORT`, and `PATCHLOOP_DATA_DIR`. Other app shapes need an adapter before they are supported.
- The first demo baseline uses a local synthetic git author identity (`local@patchloop.invalid`); this is only metadata for its isolated bundled target, not a person or event commit.
- Docker does not mount host CLI profiles. A full live repair loop runs natively with host-installed tools.
- The hosted runner keeps provider CLI profiles and target worktrees local, but task text, progress, CLI evidence, and the reviewable diff are synced to Render for the private web history. Do not submit secrets in task text or run repositories you do not trust on your computer.
- GitHub CLI auth and Git credentials are managed by the user on the runner. Render receives repository metadata and URLs for the account-scoped picker, not GitHub tokens or target source.
- Hosted JSON state and pairing metadata require the configured persistent disk and a single web-service instance. The current queue is not a distributed or horizontally scaled worker system.
