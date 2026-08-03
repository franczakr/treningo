---
change_id: testing-account-isolation
title: Prove account isolation holds automatically (test-plan Phase 2)
status: archived
created: 2026-08-02
updated: 2026-08-03
archived_at: 2026-08-03T10:24:36Z
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Account isolation".

Risks covered: #1 (a signed-in user reaches another account's saved plan or body metrics — age, weight, lifts).

Test types planned: integration.

Risk response intent: prove that user B, holding a valid session, requests a plan id belonging to user A and receives nothing — not a 200 with A's data. Same for profile reads. Must challenge the assumption that "RLS is enabled" equals "isolation holds" — policies can exist and still not be exercised on the path the app actually takes. Must ground: which client carries the end-user session vs. a privileged one; whether the anon key + RLS is the only defense or an explicit ownership filter also runs; how a missing/foreign id is expected to surface. Anti-pattern to avoid: testing isolation through a mocked database client — a mock returns whatever you told it to and proves nothing about a policy.
