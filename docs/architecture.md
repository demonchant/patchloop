# Architecture and trust boundaries

## Local execution flow

```text
Browser
  → local PatchLoop HTTP API + atomic JSON store
  → committed target baseline
  → retained detached Git worktree for this task
  → target app with fresh run data on an ephemeral loopback port
  → real `kane-cli run ... --agent --headless`
  → persisted failure, final event, exit code, fixed objective hash
  → human-approved Codex CLI repair in the same worktree
  → same objective and new isolated target data
  → successful final Kane event + exit 0 → verified
```

The browser can supply a task, objective, and target ID. It cannot submit a path, command, CLI flag, arbitrary URL, environment override, or output path. The target is selected from runner configuration; a committed `patchloop.target.json` can define install/start commands. Treat those commands as code and inspect the target before registering it.

## State and invariants

- The exact acceptance objective is hashed with SHA-256 when the task is created.
- The first Codex call requires two consecutive failed Kane attempts with that same saved hash.
- Human action gates Codex. The agent receives the requested change, original objective/hash, and redacted failure output.
- Kane attempts use the task's retained worktree and fresh target data. Reverification never resets the worktree to baseline.
- A successful verification requires a final one-shot `run_end` with `status: "passed"`, a zero process exit code, and no output overflow. Unknown, missing, malformed, timed out, or contradictory results stay non-green.
- The agent does not commit, merge, push, deploy, or change the fixed objective through PatchLoop.

## Hosted worker mode (optional)

Google OAuth signs in the hosted UI. A one-time pairing code exchanges for an owner-scoped bearer token. The worker sends a sanitized target catalog (IDs, labels, readiness) and polls for a claimed run. It keeps CLI profiles, target checkout paths, worktrees, and task app data local.

The current service stores pairing codes and OAuth state in process memory and writes JSON state to one local file. It is a single-instance design; horizontal scaling and ephemeral-disk deployments are unsupported. The paired worker is trusted to execute approved tasks, and a compromised worker could still forge reports. Server-side report checks enforce basic objective and Kane-result consistency but are not cryptographic attestation.

## Persistence and failure

Local JSON writes use a temporary file and atomic rename. Local worktrees live below `.patchloop/worktrees/<run-id>`. Repair attempts are capped at two. A stale worker claim becomes inconclusive and requires inspection before retry; it is not silently replayed. A process crash may leave the worktree for recovery, but external CLI processes may have stopped mid-run.

## Security boundaries and limits

- Local server default: `127.0.0.1`. Do not expose it to a public network.
- Local runner only permits HTTPS for remote hosted servers; plaintext HTTP is accepted for loopback development. Redirects are rejected on credentialed requests.
- Child target processes receive an allowlisted environment plus the declared target manifest values; host OAuth/session variables are not inherited.
- Kane/Codex profiles stay in the local user home directory. Worker token file is a bearer credential and must be protected.
- Codex edits target code in an isolated worktree, but target install/start code and Codex remain local processes. Register only repositories you trust.
- JSON state is not tamper-proof. A local user with filesystem access can edit it.
- Hosted OAuth, TLS, persistent storage, backups, and recovery have not been validated in a live deployment.
