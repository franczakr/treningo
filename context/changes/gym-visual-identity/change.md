---
change_id: gym-visual-identity
title: Gym visual identity — colour + type tokens & shared page shell (roadmap F-02)
status: implemented
created: 2026-08-02
updated: 2026-08-02
---

## Notes

Roadmap foundation F-02 (NFR — visual identity, added in PRD v2). Unblocked
2026-08-02 after three design decisions: system font stack, no dark theme,
single steel-blue accent for calls-to-action.

Deliberately capped at tokens + typography + a navigation slot in the shared
shell — it does **not** restyle the ~192 hardcoded colour classes across 19
files (that is S-08), so it lands with zero visible change to any existing
page. S-06 and S-07 are the first real consumers.
