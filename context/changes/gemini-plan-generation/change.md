---
change_id: gemini-plan-generation
title: Switch FR-003 plan generation to free Google Gemini 2.5 Flash
status: impl_reviewed
created: 2026-06-28
updated: 2026-06-28
archived_at: null
---

## Notes

switch FR-003 plan generation from Anthropic SDK (Opus 4.8) to a free provider, Google Gemini 2.5 Flash via @google/genai, keeping the prompt builder, validator, and retry layer. Deliberate deviation from tech-stack.md (LLM via Anthropic SDK).
