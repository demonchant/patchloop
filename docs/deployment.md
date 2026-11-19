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

The GitHub repository contains the PatchLoop project. `PATCHLOOP_TARGET_REPO` must be a local Git checkout on the machine running PatchLoop; it is not a GitHub URL. The demo-kit script creates this local target automatically. PatchLoop does not upload the target or its repair worktree.

### Temporary read-only URL for judges

Cloudflare [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) provide temporary `trycloudflare.com` URLs without a domain or Cloudflare account. The `--allowed-mail` option requires an emailed one-time PIN for explicitly allowed email addresses. `demo-kit/start-quick-tunnel.ps1` points the tunnel at a loopback-only viewer proxy, not the PatchLoop executor. The proxy allows only required GET routes; it returns a static preflight view and denies POST, repair, verify, and arbitrary paths. Use the unique temporary demo state so shared history contains only the intended demo.

The URL changes each time and has no uptime guarantee. Keep the PatchLoop terminal and tunnel terminal open while the URL is in use. PatchLoop polls run history and does not use SSE, so Quick Tunnel's SSE limitation does not affect this interface. The owner operates PatchLoop through the local URL; tunnel visitors are read-only. Send the temporary URL only to the allowed viewers.

## Required local prerequisites

- Node.js 20 or newer and Git.
- Kane CLI, a TestMu AI account signed into that CLI, remaining Kane credits, and Chrome.
- Codex CLI signed in through its native login flow.
- For a non-bundled target, a clean Git repository following the Node target contract above.

PatchLoop does not need or accept a cloud database, payment provider, domain, or public deployment credential.
