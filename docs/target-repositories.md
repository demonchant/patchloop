# Target repositories

PatchLoop's repository picker lists the bundled Goodwork demo and any configured repository reported by the local Engine or paired worker. You can also paste a GitHub repository root link directly into a new run. A selected target ID and, for GitHub runs, the canonical repository URL are saved with each run. Hosted pages receive the URL and run task; local filesystem paths and GitHub credentials stay on the worker.

## Requirements

- The repository root has a committed Git `HEAD`. PatchLoop creates a detached worktree from that commit; uncommitted files in the selected checkout are not copied.
- The app starts on `PATCHLOOP_PORT` (also provided as `PORT`) and binds to `PATCHLOOP_HOST` (`127.0.0.1`).
- Each run uses a fresh `PATCHLOOP_DATA_DIR` so task data does not leak between verification attempts.
- The app exposes a successful readiness endpoint. The default is `/api/health`.
- Register only repositories whose install and start code you trust. PatchLoop executes those commands locally inside its disposable worktree.

Without a manifest, PatchLoop supports a Node application with a root `server.mjs`; it starts it with the current Node executable and checks `/api/health`.

## Optional manifest

Put `patchloop.target.json` at the repository root and commit it:

```json
{
  "name": "My app",
  "requirements": "Node.js 20+; dependencies installed by npm ci.",
  "readyPath": "/api/health",
  "install": {
    "command": "npm",
    "args": ["ci"]
  },
  "start": {
    "command": "node",
    "args": ["server.mjs"]
  }
}
```

Supported fields:

- `name` and `requirements`: picker label and setup notes.
- `install.command`, `install.args`, and optional `install.shell`: dependency setup run from the isolated worktree before each app start.
- `start.command`, `start.args`, and optional `start.shell`: app launch command. The literal `{{port}}` is replaced with the allocated port in command and argument strings.
- `readyPath`: local URL path checked for a successful response; defaults to `/api/health`.
- `env`: additional string environment values. PatchLoop sets its run-specific host, port, and data directory after these values.

Commands are started directly by default. Set `shell: true` only when the target needs shell syntax. The worker executes manifest commands with the user's operating-system permissions. Review the manifest and source before registering a repository.

## Use a GitHub link

In the **Or use a GitHub repository link** field, paste a repository root such as `https://github.com/owner/repository` or `https://github.com/owner/repository.git`. PatchLoop accepts GitHub.com HTTPS links without embedded credentials, query strings, fragments, or a branch/file path. At the start of a run, the local Engine or paired worker clones the repository into its private `.patchloop/` data directory, fetches the latest default-branch commit, and creates the run's detached worktree from that commit. The hosted service does not clone or execute the repository.

To connect a GitHub account and choose from its repository list, install [GitHub CLI](https://cli.github.com/) on the computer running PatchLoop, then run:

```powershell
gh auth login
gh auth setup-git
```

Restart the local app or paired worker. The target picker shows up to 100 repositories returned by GitHub's authenticated-user repositories API, including owner, collaborator, and organization-member repositories available to that account. Public repositories can also be supplied by link without GitHub CLI sign-in. A private repository needs local GitHub access to clone; a branch push also needs write permission and a configured Git author name/email. PatchLoop does not ask for or store a GitHub token. If Git cannot access the repository, the run stops with a setup error. Review a repository and its `patchloop.target.json` before submitting it: its install and start commands run locally with your user permissions.

The GitHub link is attached to each run, so it can be reviewed later. Retrying a run uses that saved repository URL. The runner refreshes its cached clone when a new verification starts; an existing repair worktree remains based on its original commit.

After a Codex repair passes the unchanged Kane objective, **Push repair branch** can create a local commit and push it to a new `patchloop/repair-<run-id>` branch. PatchLoop checks that the displayed worktree diff still matches the repair, asks for confirmation, and uses a normal non-force Git push. It never pushes this repair to the default branch or merges it. The branch link and commit are recorded in the run history. GitHub branch protection, missing write access, or missing local Git author configuration can block the push; the repair remains in the local worktree for review.

## Configure and choose a repository

For the integrated local app:

```powershell
$env:PATCHLOOP_TARGET_REPO = 'C:\path\to\your\app'
npm start
```

For hosted use, clone PatchLoop's `demonchant/patchloop` checkout onto the computer that runs the worker. A target project can be configured as a local checkout with `PATCHLOOP_TARGET_REPO`, or supplied as a GitHub link in the PatchLoop form; the latter is cloned automatically on the worker. Do not point `PATCHLOOP_TARGET_REPO` at the PatchLoop runner checkout unless PatchLoop itself is the target you want to test.

For example, in Windows PowerShell, clone the showcase target next to the runner checkout:

```powershell
cd $HOME
git clone https://github.com/demonchant/patchloop-full-showcase.git
```

Review the target repository and its `patchloop.target.json` before running it. A cloned Git repository supplies a committed baseline by default. For your own project, commit the exact files you want PatchLoop to use; the worker creates a detached worktree from `HEAD`, so uncommitted edits in the target checkout are not included.

Set the target path in the **same PowerShell session** that will start the worker. This example also checks that the checkout and manifest are present:

```powershell
$target = Join-Path $HOME 'patchloop-full-showcase'
Test-Path (Join-Path $target 'patchloop.target.json')
$env:PATCHLOOP_TARGET_REPO = (Resolve-Path $target).Path
npm run worker -- --url https://patchloop-web-f9wj.onrender.com
```

For your own application, either replace the showcase path with its local checkout path or paste its GitHub link into the run form. On first use, copy the one-time pairing command from the signed-in PatchLoop page and run it in this same terminal, after setting the variable if using a local path:

```powershell
npm run worker -- --url https://patchloop-web-f9wj.onrender.com --pair-code <ONE_TIME_CODE_FROM_PATCHLOOP>
```

The worker prints how many ready repository targets it registered. With the bundled demo and showcase configured, it should report **2 repository targets**. Keep that terminal open. Sign into the hosted site with the same Google account used to pair, refresh the page, and choose the named target before submitting a task. If the target is missing, stop the worker and check the path, `Test-Path` result, and target count; then start it again. Every new PowerShell window needs `PATCHLOOP_TARGET_REPO` set again before starting the worker. A `Setup failed` event that says to set this variable is a runner configuration problem, not a Kane failure; correct the configuration before replaying the run. Existing records retain their original target and objective.

## Showcase target

[`examples/patchloop-full-showcase`](../examples/patchloop-full-showcase) is the standalone sample target published at [demonchant/patchloop-full-showcase](https://github.com/demonchant/patchloop-full-showcase). You can paste that repository link into a run without setting `PATCHLOOP_TARGET_REPO`; the paired runner fetches it locally. Its initial commit intentionally clears completion when a task is restored. The intended code-repair demonstration is two failures of the fixed Kane objective, a human-approved Codex repair, diff review, and a pass of the unchanged objective. A setup error or a Kane pass without a recorded repair diff does not demonstrate that repair loop.

The supplied screen recording shows the target setup error followed by a Kane pass with no code diff. It documents configuration recovery and the observed browser run, but does not demonstrate a Codex repair. Do not describe the seeded restore bug as repaired without recorded repeated failures, human-approved Codex output, a real diff, and a passing same-objective Kane rerun.
