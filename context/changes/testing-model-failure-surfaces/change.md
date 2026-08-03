---
change_id: testing-model-failure-surfaces
title: Model failure surfaces (test-plan Phase 4)
status: planned
created: 2026-08-03
updated: 2026-08-03
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Model failure surfaces".
Risks covered: #4 (a model-side failure ends as a 500 or a blank screen instead of a clean, retryable error — or worse, a partial plan the user believes is real), #7 (an unexpected server error shows the user raw internal detail — database message, provider error body — instead of a generic message).
Test types planned: unit, integration.
Risk response intent:
- #4: prove each documented model-side failure path ends in the defined error type plus a retryable UI — never a partial plan, never an unhandled 500. Must challenge: "no block reason was set" is not "generation succeeded" — a stop reason can end generation without one (gemini-plan-generation impl review F1), and truncation caused by thinking tokens eating the output cap (F3) produces text that fails to parse. Cheapest layer: unit, with substituted responses at the provider SDK boundary. Anti-pattern to avoid: over-mocking internal modules instead of the SDK boundary; covering the happy path plus one error and calling it done — there are at least five distinct surfaces.
- #7: prove a forced database or provider error produces a generic user-facing message, with the specific detail reaching only the server log. Must challenge: "we fixed that one leak" is not "every error path is clean" — read paths are documented as still having no handling (browse-saved-plans impl review F1). Cheapest layer: integration. Anti-pattern to avoid: asserting only on the status code — a 500 with a leaked message and a 500 with a generic one are the same status.
