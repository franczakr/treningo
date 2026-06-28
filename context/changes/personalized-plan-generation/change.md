---
change_id: personalized-plan-generation
title: Personalized plan generation + soundness validation (north star, S-02)
status: implementing
created: 2026-06-28
updated: 2026-06-28
archived_at: null
---

## Notes

Roadmap slice **S-02** (north star, FR-003 + FR-004): a user with a completed
training profile requests a plan and immediately views one tailored to their
goal, experience, equipment, and chosen training days. LLM-based generation
(Anthropic Opus 4.8, structured outputs) + post-generation validation layer
enforcing the FR-003 plan-soundness guardrails with retry. Ephemeral
generate-and-view — persistence is S-03, browsing is S-04.
