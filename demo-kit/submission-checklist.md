# Submission checklist

The event page lists a public GitHub repo, a YouTube demo of about 3–5 minutes, a short project/agent/Kane description, and at least two public project posts. It also requires TestMu signup and an actual Kane run. See [official event rules](https://www.kaneclihack.sh/).

## Required proof

- [ ] TestMu AI account is signed up with the event registration email; Kane CLI is authenticated locally.
- [ ] Codex CLI is authenticated locally.
- [ ] Current `npm run check` and unit tests pass.
- [ ] One real event-window PatchLoop run shows two matching Kane failures, human-triggered Codex repair, and same-objective Kane pass.
- [ ] Run record shows identical objective hash, real final Kane event, and exit code zero.
- [ ] Public GitHub repo is accessible without sign-in; README setup works from a clean clone.
- [ ] New 3–5 minute YouTube demo is Unlisted, begins with the interesting part, and works in an incognito window.
- [ ] At least two public project posts are live; save their URLs. Drafts are not evidence of publication.
- [ ] Submission form is complete before 11:59 PM IST on November 19, 2026; save the actual receipt.

## One-paragraph submission draft

PatchLoop is a local-first workbench for developers who use coding agents and want browser evidence before accepting a change. Built with Codex CLI and verified with Kane CLI, it fixes an acceptance objective, runs it against a local app in an isolated Git worktree, and preserves a repeated Kane failure for human review. After approval, Codex receives the unchanged task and real failure output; PatchLoop shows the resulting diff and reruns the same objective. In the demo, a disposable task app has a disclosed restore regression so the full failure, repair, and verification path is visible. PatchLoop does not auto-commit, push, merge, or deploy. Replace this draft with the exact result that the recorded run proves.

## Two-post draft plan

Write and publish from your own account only after the live run/video links exist. Do not claim reach or engagement without seeing it.

**Post 1 — build progress:** “I’m building PatchLoop for the Kane CLI Online Hackathon: a local workbench where Kane checks a browser flow, and a coding agent can act on a reproduced failure. I’m testing the loop with Codex CLI and a real local app. More soon. #KaneCLIHackathon #KaneCLI”

**Post 2 — launch:** “PatchLoop closes a browser verification loop: Kane runs a fixed acceptance objective, Codex gets a repeated failure only after human approval, and Kane reruns the same objective after the diff is reviewed. Demo: [YouTube link]. Code: [public repo link]. Built with Codex CLI and Kane CLI. #KaneCLIHackathon #KaneCLI”

These are drafts only. Check each platform's current rules and add the required tags/format before publishing.
