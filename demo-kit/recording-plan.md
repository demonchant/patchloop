# Three-minute recording plan

Target length: about 3:00 (the event accepts a 3–5 minute YouTube video). Show the real UI, actual Kane activity, Codex's worktree diff, and the final same-objective result. A cut may skip idle browser time; do not hide a failure, change the objective, or imply separate runs were one uninterrupted action.

| Time | Capture | Narration / proof |
|---|---|---|
| 0:00–0:15 | PatchLoop title and workbench | State the problem: code can be written quickly, but the browser flow still needs proof. Introduce PatchLoop as a local workbench that links Kane's result to a reviewed Codex repair. |
| 0:15–0:35 | Local preflight and guardrails | Show Kane, Codex, and the configured disposable target ready. Point out the fixed objective, isolated worktree, and human review. |
| 0:35–0:55 | Task and objective fields | Say the target is deliberately seeded with one restore regression. Use: task “Keep a completed task completed when it is restored from Archived.” Objective: “Create a task, mark it complete, archive it, confirm it appears in Archived, restore it, then confirm it appears in Active and still has its completion checkmark.” Submit once. |
| 0:55–1:20 | First real Kane run | Show Kane interacting with the browser and the actual failure. Open run details and show the objective hash and failed final result. If the failure is unrelated to the restore state, stop and retry later; do not present it as the seeded bug. |
| 1:20–1:40 | Replay unchanged objective | Click the same-run verification action. Show that the objective hash stays identical and Kane reproduces the completion-state failure. If results differ or become inconclusive, do not send Codex a non-reproduced failure. |
| 1:40–2:10 | Human-approved Codex repair | Click the available repair action. Show the agent event and worktree diff. The expected minimal change removes the seeded reset of `completed` during restore. State that the user, not the agent, reviews the diff. |
| 2:10–2:40 | Same-objective rerun | Trigger Kane again on the saved objective. Show the browser steps, the pass status, and the same objective hash. Open details to show the actual final event and zero exit status. |
| 2:40–3:00 | Result and limitations | Show the diff/history and explain that PatchLoop leaves changes in the worktree: it does not commit, push, merge, or deploy. End with the repo URL only after it is public and the video link has been tested. |

## Recording controls

- Start from a fresh PatchLoop state and an empty demo target. The launcher creates both with unique temporary paths.
- Keep the app's local address visible. Hide personal desktop notifications and unrelated windows before recording; do not expose CLI profiles or credentials.
- Capture the actual UI outcome. Use run details to show event count, result code, exit code, objective hash, and diff. Do not put raw secrets or account identity on screen.
- If the repair run fails, show the honest failure or record again after diagnosing it. Do not edit it into a pass.
- If editing, use a visible “waiting for browser run” time cut where needed. Preserve chronology: failure → replay → human approval → diff → rerun.
- Check final duration and open the unlisted YouTube link in a signed-out/incognito window before submitting.
