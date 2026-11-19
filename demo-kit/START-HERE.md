# PatchLoop demo kit

This kit gives you the setup, live run, recording outline, narration, and submission materials for a three-minute demo. The demo target is a disposable task app with one intentionally seeded regression: restoring an archived completed task clears its completed state. Say this in the recording. PatchLoop itself is not altered by the fixture, and no run result is prefilled.

## Before recording

1. Sign in to TestMu AI and claim the event credits. Sign in locally with `kane-cli login --oauth` and keep credentials out of chat and the repo.
2. Confirm Codex CLI is signed in with `codex login` if needed.
3. Run `demo-kit/start-demo.ps1` from the project root. It creates a fresh local demo target and starts PatchLoop in the foreground. Keep the terminal visible and open the loopback URL printed by the script.
4. In preflight, confirm Kane is authenticated, Codex is installed, and the configured demo target is ready. Do not record until each check is green.
5. Review the [recording plan](recording-plan.md), [voiceover](voiceover.md), and [submission checklist](submission-checklist.md).

The launcher and local health route were exercised here. This runtime blocks PatchLoop's child-process preflight (`spawn EPERM`), so it could not verify Kane or Codex; rerun preflight on the machine you will record from.

## Temporary live URL (optional)

Cloudflare Quick Tunnel can provide a temporary `trycloudflare.com` URL without a domain or Cloudflare account. It asks every visitor for an email PIN. The URL changes each time and works only while your computer and the tunnel stay running. Use specific email addresses you intend to invite.

After the local PatchLoop window is running, open a second terminal, go to the project folder, and run the command printed by the launcher with the port and viewer email addresses. Example:

```powershell
demo-kit/start-quick-tunnel.ps1 -PatchLoopPort 63893 -AllowedEmail you@example.com -AllowedEmail judge@example.com
```

The tunnel exposes a separate read-only proxy. Visitors can see the dedicated demo's runs and diffs; they cannot run Kane, invoke Codex, or trigger target code. You control the demo from the local PatchLoop URL. Read [deployment notes](../docs/deployment.md) before sharing the temporary URL.

## The live loop

There are three separate things:

- **PatchLoop project:** the `kane cli` folder/repository. This is what belongs on GitHub.
- **Change request and objective:** the two text fields. The bundled-task button only fills these prompts; it does not select code.
- **Target app:** the local app PatchLoop edits and tests. The launcher creates a temporary Git repo for it and configures PatchLoop to use that repo. It does not need its own GitHub repo.

For the public showcase target, clone `https://github.com/demonchant/patchloop-full-showcase.git` locally, set `$env:PATCHLOOP_TARGET_REPO` to that clone before starting PatchLoop, and select **PatchLoop Full Showcase** in the repository picker. The target repo README contains the full run setup and fixed challenge.

Use the demo preset or enter the exact task and acceptance objective from the recording plan. Run Kane once. If it returns a failure, run the same saved objective again. Only send a second failure to Codex if the two failures match and the UI offers the human approval action. Review the diff. Then rerun the same objective and show the actual final result.

If Kane passes immediately, the closed-loop sequence has not happened. Do not invent a failure or claim Codex repaired it; prepare a fresh demo fixture and restart, or record the verified pass and describe the repair loop as implemented but not demonstrated.

## Files in this kit

- [start-demo.ps1](start-demo.ps1) builds the disposable regression fixture and launches PatchLoop.
- [recording-plan.md](recording-plan.md) gives the scene order, timing, and exact UI actions.
- [voiceover.md](voiceover.md) is a narration draft; adjust result statements to match the recording.
- [submission-checklist.md](submission-checklist.md) tracks the repo, video, event proof, and two required public posts.

Record a fresh screen capture. Do not reuse the old `1.mp4` as if it were this event's run. Trim waiting time only with clear cuts; retain real Kane/Codex outcomes and avoid editing separate sessions to look uninterrupted.
