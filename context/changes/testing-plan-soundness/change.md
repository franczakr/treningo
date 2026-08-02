---
change_id: testing-plan-soundness
title: Test runner bootstrap + plan-soundness guardrails (test-plan Phase 1)
status: impl_reviewed
created: 2026-08-02
updated: 2026-08-02
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Runner bootstrap + plan soundness".

Risks covered: #2 (a generated plan uses equipment the user does not have, the wrong number of training days, or contradicts the stated goal — and is still displayed and savable) and #5, schema side (a payload passes server-side schema validation but is rejected by a database constraint, or the reverse).

Test types planned: unit, plus a CI gate wiring the suite into the existing lint+build workflow so the floor is locked from the first test.

Risk response intent:
- #2: prove that for a profile stating specific equipment, a day count, and a goal, no plan the system reports as acceptable contains equipment outside that list or a different number of sessions. Challenge the assumption that "the validator returned ok" equals "the plan honors the guardrail" — the goal check is lenient by design and soft-failure plans are shown and savable. The single most dangerous anti-pattern here is the oracle problem: the expected result must come from the input profile and the PRD guardrail, never from re-implementing the validation code and comparing it to itself.
- #5: prove that every value the schema accepts is accepted by the database, and every value a database constraint rejects is rejected earlier by the schema. Challenge the assumption that "the schema passed" equals "the database will take it" — this class of bug already shipped once. Avoid testing the schema in isolation; that is an implementation mirror and cannot detect drift.

Note: this project has no test base at all (no runner config, zero test files), so this phase also stands up the runner. Section 4 of the test plan records the stack grounding for that choice.
