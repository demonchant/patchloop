# Setup and operations

## Local requirements

- Windows, macOS, or Linux with Node.js 20+, Git, and Google Chrome.
- Kane CLI and an authenticated TestMu account with credits. Kane requires Chrome for web runs. See the official [Kane installation](https://www.testmuai.com/docs/kane-cli-installation), [authentication](https://www.testmuai.com/docs/kane-cli-authentication), and [Agent Mode](https://www.testmuai.com/docs/kane-cli-agent-mode) docs.
- Codex CLI installed and signed in locally.
- A trusted target repository with a committed baseline, a root `server.mjs` or reviewed `patchloop.target.json`, a `/api/health` endpoint, and support for `PATCHLOOP_HOST`, `PATCHLOOP_PORT`, and `PATCHLOOP_DATA_DIR`.

Kane runs consume account credits. Check the account balance and approve their use before running a real browser loop.

## First local run (PowerShell)

From the PatchLoop project directory:

```powershell
npm ci
npm install -g @testmuai/kane-cli @openai/codex
kane-cli login --oauth
codex login
npx playwright install chromium

$target = (Resolve-Path .\examples\patchloop-full-showcase2).Path # local fixture copy in this build workspace
if (-not (Test-Path (Join-Path $target '.git'))) {
  git -C $target init -b main
  git -C $target add .gitignore server.mjs app.js index.html style.css patchloop.target.json README.md CASES.md seed-regression.test.mjs package.json
  git -C $target -c user.name='PatchLoop Fixture' -c user.email='fixture@patchloop.invalid' commit -m 'Seed disclosed restore regression'
}
$env:PATCHLOOP_TARGET_REPO = $target
npm run check
npm test
npm start
```

The fixture commit identity is synthetic local metadata. It does not represent an event commit author. Open `http://127.0.0.1:4173`, check runner readiness, load the showcase challenge, and inspect the objective before starting. A live Kane run uses account credits.

The example target source and its `.git` folder are excluded from the PatchLoop repo because the target is a separate project. The target is published at `https://github.com/demonchant/patchloop-full-showcase2`. In a separate PatchLoop checkout, clone it to a sibling folder and point `PATCHLOOP_TARGET_REPO` there. The local target fixture has a committed synthetic baseline and should be inspected before selecting it for a real run.

## Hosted UI with local runner

Hosted mode is optional and not deployed or verified. It currently requires a single persistent service instance because pairing/OAuth maps are in memory and the JSON store is local to one process. Do not use ephemeral disks or multiple replicas.

Prerequisites: a registered Google OAuth web client, exact HTTPS callback `<PUBLIC_URL>/auth/google/callback`, a stable public HTTPS URL, persistent writable data directory, session secret, host access, and a TLS reverse proxy/platform. Set:

```text
PATCHLOOP_AUTH_MODE=google
PATCHLOOP_EXECUTION_MODE=worker
PATCHLOOP_HOST=0.0.0.0
PATCHLOOP_PORT=<internal port>
PATCHLOOP_DATA_DIR=<persistent mounted directory>
PATCHLOOP_GOOGLE_CLIENT_ID=<server-side client id>
PATCHLOOP_GOOGLE_CLIENT_SECRET=<server-side secret>
PATCHLOOP_SESSION_SECRET=<random secret at least 32 bytes>
PATCHLOOP_PUBLIC_URL=https://<public host>
```

Never place secrets in browser code, Git, screenshots, demo prompts, or logs. A public URL is not considered deployed until health, OAuth, persistent restart, and paired-worker flows are observed.

From the signed-in PatchLoop page, generate a one-time pairing code. Run the exact command shown there from the local project directory. The first command uses `--pair-code`; subsequent restarts omit the code. On the runner computer set the local target path first:

```powershell
$env:PATCHLOOP_TARGET_REPO = (Resolve-Path 'C:\path\to\trusted-target').Path
npm run worker -- --url https://<public-host> --pair-code <one-time-code>
```

Keep `.patchloop/runner/token.json` private. It is a bearer credential. Stop and disconnect the worker after use; if the token is exposed, disconnect it and pair again. Do not use a public unencrypted HTTP endpoint. The worker rejects remote HTTP and redirects.

## Data, reset, and recovery

- `.patchloop/state.json`: local task records, events, CLI output tails, and reviewable diffs.
- `.patchloop/worktrees/<run-id>`: persistent isolated repair worktrees.
- `.patchloop/target-data/<run-id>`: throwaway app data for each check; the app starts with a fresh directory per attempt.
- `.patchloop/runner/token.json`: hosted worker bearer token, when paired.

These paths are ignored by Git and should be backed up only if private run evidence must be retained. Avoid copying CLI auth profiles into backups or the project. A stale worker claim is marked inconclusive; inspect the worktree and report before choosing another verification.

## Commands and limits

```powershell
npm run check
npm test
npm run test:e2e
npm start
npm run worker -- --url https://<public-host>
npm run worker -- --url https://<public-host> --disconnect
```

Target manifest `install.command` and `start.command` execute on the local computer with the local account's permissions. Review commands before pairing a repository. The current target contract is a Node HTTP app; other app shapes need a deliberate adapter.
