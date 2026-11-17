# Voiceover draft

Adjust this narration to what the recording actually shows. Remove or rewrite any line whose result does not occur on screen.

> Coding agents can make a change quickly. The harder question is whether the real browser flow still works. PatchLoop connects that check to the coding agent that can repair it.
>
> This is the local PatchLoop workbench. Preflight checks the installed tools and the target repository. The acceptance objective is fixed when a run starts, and the app runs in a separate Git worktree. PatchLoop only records a pass from Kane's actual final result and process exit code.
>
> For this demo, the disposable task app has one deliberately seeded regression: restoring an archived completed task clears its completed state. PatchLoop itself is unchanged. The task asks Codex to preserve completion when restoring. Kane's objective creates a task, completes it, archives it, then checks that restoration returns it to Active with the completion mark intact.
>
> Kane is now exercising the app in a real browser. The first run fails at the restored completion check. PatchLoop keeps the result for review. It asks for an unchanged replay before it sends a repeated failure to Codex.
>
> The replay has the same objective hash and reproduces the same failure. I can now choose to send that evidence to Codex. Codex works in the isolated worktree, and PatchLoop shows the diff before anything is applied elsewhere.
>
> The repair removes the reset that cleared the completed state. Now Kane runs the same objective again. [Describe the actual result shown in this recording; if it passed, point to the final event and zero exit code.] The objective hash is unchanged, so the result is tied to the original acceptance condition.
>
> PatchLoop keeps the run history and reviewable diff local. It does not commit, push, merge, or deploy automatically. The important part is the evidence loop: Kane observes the browser, Codex proposes a repair after human approval, and Kane checks the same behavior again.
