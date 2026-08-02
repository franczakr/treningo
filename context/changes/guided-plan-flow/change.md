---
change_id: guided-plan-flow
title: Guided path forward — profile → generate → saved plans (roadmap S-05)
status: implemented
created: 2026-08-02
updated: 2026-08-02
---

## Notes

Roadmap slice S-05 (FR-002, FR-003, FR-005, FR-006, US-01, PRD §Business Logic) —
the north star of roadmap v2's second phase. Every must-have FR is `done`, yet the
PRD's Primary Success Criterion ("a new user can … end to end") cannot actually be
demonstrated, because the pages satisfying those FRs do not lead to one another.

PRD §Business Logic describes the chain sentence by sentence: "the user encounters
the rule right after completing their profile: they request a plan and immediately
see one tailored to their parameters, which they can then save and revisit." Both
joints are broken today — `src/pages/api/profile.ts:58` returns the user to the
profile form, and `src/components/plan/PlanView.tsx:133` leaves them on the plan
page with no route onward.

This change closes those two joints only. It deliberately does **not** add a
persistent header or restyle anything — navigation chrome is S-07 and the visual
identity is F-02/S-08, both of which sit behind design decisions that are still
open.
