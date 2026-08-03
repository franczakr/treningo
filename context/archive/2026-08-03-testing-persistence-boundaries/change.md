---
change_id: testing-persistence-boundaries
title: Persistence round-trip and boundary contracts (test-plan Phase 3)
status: archived
created: 2026-08-03
updated: 2026-08-03
archived_at: 2026-08-03T10:52:17Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Persistence round-trip + boundary contracts".
Risks covered: #3 (saved plan comes back changed/lost shape), #5 (schema/database acceptance parity, acceptance direction), #6 (unbounded jsonb write / resource abuse via arbitrarily large plan).
Test types planned: integration.
Risk response intent:
- #3: prove a plan saved in one session and read back in a later one is structurally identical and still parses against the current schema. Must challenge: "it returned 200" is not "it comes back the same" — snapshot shape drift between write-time and read-time types is documented (see save-plan impl review F1), and older stored rows were written under the older shape.
- #5 (acceptance direction): prove every value the zod schema accepts is actually accepted by the real database — this is the integration half; the unit/rejection half already shipped in Phase 1. Must challenge: "the schema passed" is not "the database will take it" — a CHECK constraint can look correct and not fire at all (see array_length no-op finding from Phase 1).
- #6: prove a plan with an absurd number of sessions or exercises is rejected before anything is persisted. Must challenge: "the endpoint is behind auth" is not "it cannot be abused" — one authenticated account is all it takes; the schema currently has no array-length caps (save-plan impl review F3, accepted-then-skipped).
