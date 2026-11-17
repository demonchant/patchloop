# KaneCLI Online Hackathon readiness

**Checked:** 2026-11-17 (Africa/Lagos). **Official source:** [KaneCLI Online Hackathon by TestMu AI](https://www.kaneclihack.sh/). The user also supplied the event page, organizer emails, and launch guide in chat; those materials are retained here as requirements, not as proof that PatchLoop meets them.

## Official requirements

- Build window: November 12–19, 2026. Submission deadline: November 19, 11:59 PM IST (10:29 AM PT).
- The app and Kane CLI integration must be built during the event. The repo must be initialized on or after November 12; organizers check commit history. Their FAQ says an old idea is acceptable, but an old codebase is not.
- To be scored, the entrant must have a TestMu AI account and must have run Kane CLI. The official page describes the TestMu signup/credits requirement.
- Three ship bars: a real end-to-end app flow; Kane meaningfully catches a bug or proves a flow; the coding agent and Kane exchange results. Four equally weighted scoring categories: Ships, Verified, Closed loop, Craft. Ties break on Verified, then Closed loop.
- Submission requires a public GitHub repository, a YouTube demo of about 3–5 minutes, a short project/agent/Kane description, and at least two public posts about the project on X, LinkedIn, Hacker News, or Reddit. More posts and engagement earn brownie points. A deployed URL is optional if the project runs locally.
- Solo or teams of up to four; entrants must be 18 or older and may be anywhere in the world.

## PatchLoop status and eligibility limit

The source folder already contained PatchLoop code and a verification record dated October 9, 2026, before this event. The root folder was not a Git repository when inspected. Creating a Git repository during the event would establish its initialization date, but it would not establish that this pre-existing codebase was built during the event. The official FAQ says old codebases are not eligible; only TestMu AI can decide whether an event-window rebuild of this project qualifies. No history will be rewritten to hide provenance.

PatchLoop implements a human-gated Kane failure → Codex repair → same-objective Kane rerun path in source. Existing Kane evidence is from October 9, not this event. A live PatchLoop Codex repair and subsequent Kane pass have not been observed in the records reviewed. Current local checks are not event-week Kane proof. There is no recorded demo video, pair of public launch posts, public repo, or submission receipt in the project evidence.

## Product claims and limits

- **AI IN PRODUCT: NO.** The event requires using an AI coding agent and Kane in the build workflow; it does not require an embedded model. Codex is the bounded repair agent; PatchLoop's code decides and records verification results.
- TestMu's stated problem framing is that coding agents need a way to verify their work. This is the organizer's rationale, not independent user research or proof of broad demand.
- No direct user interviews, product usage data, or independent competitor study are documented. Do not claim market validation, novelty, or adoption from this project record.
- No feature additions are planned. Work is limited to correctness, security, test isolation, truthful evidence, and handoff readiness.

## Submission checklist

| Item | Current evidence |
|---|---|
| Eligible event-built code and Kane integration | **Unresolved/high risk:** project predates event; request organizer ruling. |
| TestMu signup and Kane run for entrant | Not verified in project files; account state is not inspected or asserted. |
| App works end to end | Existing local UI/API and bundled app checks are recorded; rerun current checks before handoff. |
| Meaningful Kane proof | October 9 pre-event evidence only; current event run pending. |
| Agent↔Kane feedback | Flow exists in source; current live repair/rerun proof pending. |
| Public GitHub repository initialized during event | Not created; no repo target specified. |
| 3–5 minute YouTube demo | Not recorded or published. |
| At least two public project posts | Not published or verified. |
| Submission form/receipt | Not submitted. |

Do not publish posts, create an external repository, submit, or represent eligibility without the user's next direction and the necessary exact target details.
