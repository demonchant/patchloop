# Submission copy and demo cues

## One-paragraph draft

PatchLoop is a local-first workbench for developers using coding agents who want browser evidence before accepting a change. Built with Codex CLI, it records a Kane CLI run against a fixed natural-language acceptance objective, keeps a first failure for human review and same-objective replay, then can send a reproduced failure to Codex in an isolated Git worktree. After the developer reviews the diff, PatchLoop reruns the exact objective and only marks the task verified from Kane's observed final event and exit code. It stores run history locally and does not automatically merge, commit, push, or deploy changes.

This describes implemented behavior, not proof that a complete repair loop has passed in this environment. Update the paragraph only after the real Kane → Codex → Kane run is recorded, and state the actual result.

## Three-minute path (prepared, not a recording)

1. Open the workbench and show local preflight, the fixed objective field, and the empty run history.
2. Load the bundled demo task and submit it. Show the actual first Kane verdict and objective hash.
3. Replay the unchanged objective. If the two actual failures match, show the persistent-failure state. If Kane outcomes differ, show `inconclusive` and do not send the result to Codex.
4. Only after the same failure is reproduced, click **Send repeated failure to Codex**. Show the real CLI call and isolated worktree diff.
5. Run Kane against the same objective again. Show the actual final result and the downloaded diff. If it fails or becomes inconclusive, show that honestly.

Do not edit a failed Kane result into a passing one, stage a run, or claim success without a final `run_end`, exit code zero, and actual passing result code. If a live dependency is unavailable, record the setup failure and use only a separately recorded genuine run if the event permits that fallback.
