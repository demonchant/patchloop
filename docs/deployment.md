# Run and deployment path

## Integrated local mode (recommended)

The app stays on loopback and invokes the native Kane/Codex installs and Chrome profiles of the signed-in local user.

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:4173`. A successful start prints the local URL. The UI preflight checks the CLIs and prepares a private bundled target repository. Run `npm run check` and `npm test` before using a different target. The app uses `.patchloop/` for persistent state, demo target, worktrees, and per-attempt app data; that directory is ignored by Git.

Kane runs default to a 900-second timeout to allow multi-flow browser objectives to finish. Set `PATCHLOOP_KANE_TIMEOUT_SECONDS` from 60 to 1800 to change it; PatchLoop gives Kane an additional 15 seconds to emit its final event.

To use an existing local target, set `PATCHLOOP_TARGET_REPO` before startup. Its working tree should be clean and committed. The worktree target needs a root `server.mjs`, `/api/health`, and support for `PATCHLOOP_PORT` and `PATCHLOOP_DATA_DIR`. PatchLoop does not execute arbitrary shell text from the browser.

## Docker UI/API mode

```powershell
docker compose up --build -d patchloop
docker compose ps
docker compose logs --tail 80 patchloop
```

Docker publishes only `127.0.0.1:4173`. The image runs as a non-root user with a read-only root filesystem, dropped capabilities, and a persistent named volume. Use `docker compose down` to stop it. Use `docker compose down -v` only if you intend to remove the saved local records and worktrees.

The authenticated CLI profiles are intentionally not copied or mounted into Docker. Therefore the Compose app is a UI/API deployment; live agent/Kane execution uses the native local mode. The Compose browser test profile runs a disposable app container and a pinned Playwright container with no CLI credentials.

## External/public hosting

No public server is required for the event brief, which accepts a runnable local command. Do not expose the process-execution API to a public network. A public multi-user deployment would require authentication, per-user workspace isolation, job authorization, and secret-management changes that this local-first app does not implement.

## Required local prerequisites

- Node.js 20 or newer and Git.
- Kane CLI, a TestMu AI account signed into that CLI, remaining Kane credits, and Chrome.
- Codex CLI signed in through its native login flow.
- For a non-bundled target, a clean Git repository following the Node target contract above.

PatchLoop does not need or accept a cloud database, payment provider, domain, or public deployment credential.
