# Render setup and screen recording

## Two editions

| Edition | Where it runs | Sign-in/config | Execution |
|---|---|---|---|
| Local PatchLoop | Your computer; start the root project with `npm start` | No Google OAuth or hosted secrets. Uses the local browser and CLI profiles. | Kane/Codex execute on that computer. Keep it bound to loopback. |
| Private hosted PatchLoop | Render Blueprint created from this repository's root `render.yaml` | Google sign-in and server-side `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PATCHLOOP_SESSION_SECRET`. | Hosted UI queues to a separately paired local runner; code and CLI credentials stay on that runner. |

These are separate deployments and data stores. The hosted edition does not turn the local edition into a public service; the root local app remains loopback-only.

## What this deploys

Render hosts the PatchLoop web UI, Google sign-in, and task history. Kane, Codex, Chrome, the target repository, and repair worktrees stay on your paired computer. The Render app queues work to the paired runner; do not configure it to launch local commands on the public web service.

The repository-root [`render.yaml`](../render.yaml) configures Google auth, worker execution, `/api/health`, and a persistent disk at `/var/data`. The disk is required because this version stores task history and worker-pairing state on disk and keeps pairing/OAuth state in memory; use one Render web instance. Check Render's current plan requirements for persistent disks. Do not scale to multiple instances without replacing the in-memory coordination and JSON store.

## Deploy and configure Google sign-in

1. Push the repository containing `render.yaml` to GitHub and create a Render Blueprint from that repository. Do not commit OAuth credentials. The Blueprint can deploy before Google OAuth is configured; sign-in remains unavailable until you add the client values in the Render dashboard.
2. Use the Render-assigned HTTPS URL, for example `https://patchloop-<your-suffix>.onrender.com`. In Google Cloud Console, configure an OAuth client of type **Web application**. Add the Render origin to Authorized JavaScript origins and this exact callback to Authorized redirect URIs:

   ```text
   https://<your-render-host>/auth/google/callback
   ```

3. In the Render service environment, set the real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy. The Blueprint generates `PATCHLOOP_SESSION_SECRET` and sets `NODE_ENV=production`, `PATCHLOOP_AUTH_MODE=google`, `PATCHLOOP_EXECUTION_MODE=worker`, and `PATCHLOOP_DATA_DIR=/var/data`. Render supplies `PORT` and `RENDER_EXTERNAL_URL`.
4. In the Google OAuth consent screen, add the accounts allowed to sign in as test users while the app is in testing. Set the production publishing/verification state appropriate to your intended audience.
5. Wait for Render's deploy health check, then visit `https://<your-render-host>/api/health` and confirm it returns `ok: true`. Sign in with Google and confirm the app reports the worker as disconnected.

If you change the Render host, update the Google redirect URI and restart/redeploy the service. Treat the OAuth client secret, session secret, and runner pairing token as credentials; never put them in a recording, chat, repository, URL query, or client-side code.

## Pair the local Kane/Codex runner

On the computer that has Kane, a supported coding agent, Chrome, and the trusted target checkout, install dependencies and start the runner as documented in the [demo and operations guide](demo-and-operations.md). Sign in to the Render PatchLoop page, create a one-time pairing code, and run the exact pairing command shown by the page from the PatchLoop checkout. Select [PatchLoop Showcase 2](https://github.com/demonchant/patchloop-full-showcase2) as the target and review its manifest before running it. Keep the runner process open for the recording. Its saved token is under `.patchloop/runner/token.json`; do not copy or show it.

The user-visible Render page is hosted; the browser automation and agent processes execute on the paired machine. This setup needs that machine online during the demo. A public URL does not mean the hosted service can access the machine's files when the runner is disconnected.

## Three-minute screen-recording script

Record at 1920×1080, hide notifications, close unrelated tabs, and use a fresh task history. Capture the Render URL and the actual app. Keep the terminal/runner visible only when it helps show a real Kane or Codex process; crop or blur usernames, local paths, OAuth details, pairing codes, tokens, and personal account information.

### 0:00–0:20 — Open with the result

**On screen:** PatchLoop loaded from its Render URL; signed in; runner status visible.

**Voiceover:** “PatchLoop gives coding-agent changes a browser check with a fixed acceptance objective. The app is hosted on Render; Kane, Codex, and the target repository stay on my paired machine.”

### 0:20–0:45 — Set the task

**On screen:** Choose PatchLoop Showcase 2 as the GitHub target. Use the bundled demo task to fill the archive/restore request and acceptance objective, then point out the objective lock/hash before starting.

**Voiceover:** “I’m asking for archive and restore behavior. The acceptance objective is saved and hashed, so the repair agent cannot quietly weaken the check.”

### 0:45–1:20 — Show Kane find the defect

**On screen:** Start Kane; show the real run transition and failure details. Replay the same objective; show matching objective hash and repeatable failure. Do not speed-edit or replace the result with prepared cards.

**Voiceover:** “Kane exercises the app in a real browser. The first failure is replayed before PatchLoop offers a repair. These are the observed Kane results for this run.”

### 1:20–1:55 — Route evidence to Codex

**On screen:** Approve the repair, show Codex working in the isolated worktree, then open the actual diff. Keep secrets and unrelated local data out of frame.

**Voiceover:** “After I approve it, Codex receives the original request and recorded Kane failure. Its changes stay in an isolated worktree for review.”

### 1:55–2:35 — Verify the same condition

**On screen:** Rerun Kane. Show the unchanged objective hash, final Kane result, process exit status, and resulting task state. If the run fails or is inconclusive, say so and show that state; do not narrate a pass.

**Voiceover:** “PatchLoop runs the same acceptance objective against the repair. It marks the task verified only from Kane's successful final event and zero exit status. Here is the result actually observed.”

### 2:35–3:00 — Close on evidence and limits

**On screen:** Show the attempt timeline and diff download link, then the repository README/run instructions.

**Voiceover:** “The timeline keeps the request, objective hash, Kane attempts, and repair diff together. The hosted UI needs the paired runner online for execution. The seeded showcase defect is disclosed; this recording shows only what this run actually proved.”

## Recording checks

- Use a genuine event-period run if presenting it as hackathon evidence. Existing October evidence predates the November event.
- Show the seeded showcase defect disclosure. A fixture or scripted recording is not a live provider result.
- Keep the complete 3–5 minute video on YouTube and test its visibility in a signed-out browser.
- Capture two separate public project posts for the submission requirement. A single post tagging `@kane_cli` does not meet the two-post minimum.
- Do not imply Render deployment, OAuth sign-in, worker pairing, or a Kane/Codex loop succeeded until each has been directly observed.
