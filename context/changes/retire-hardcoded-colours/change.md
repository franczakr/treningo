---
change_id: retire-hardcoded-colours
title: Retire starter hardcoded colours across remaining pages (roadmap S-08)
status: implemented
created: 2026-08-02
updated: 2026-08-02
---

## Notes

Roadmap slice S-08 (US-01, NFR visual identity) — the last item in roadmap v2's
second phase. Prerequisites F-02, S-06, S-07 are all implemented and reviewed.

16 files still carry the starter's dark cosmic/purple/blue theme (`bg-cosmic`,
`purple-*`, `blue-100/200`, `white/NN` glass-card borders, gradient-clip-text
headings) instead of F-02's tokens. This migrates all of them to the token
system established there, using one consistent mapping (documented in the
plan's Critical Implementation Details) so the migration is mechanical rather
than re-derived per file.

Semantic status colours (error red, success green, warning amber) are
re-tuned for the light palette, not removed — the roadmap's own risk note
flagged that a validation warning legible only because it's red must stay
distinguishable once the palette is greyscale.
