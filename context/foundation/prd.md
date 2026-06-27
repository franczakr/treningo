---
project: "Treningo"
version: 1
status: draft
created: 2026-06-27
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Treningo — Product Requirements Document

## Vision & Problem Statement

Beginners at the gym have their own personal goals but don't know how to sensibly reach them or how to build a good workout plan. In their first months of training, such a person doesn't know which exercises to do, how often, or how many sets and reps — and has to spend a long time researching this online and adapting it to themselves, or pay for a personal trainer.

Insight: the status quo (ready-made plans from the internet, videos, PDFs) is generic. The key advantage is personalizing the plan to a person's specific goal, instead of handing out a one-size-fits-all plan. The pain combines a lack of training knowledge with the time cost of assembling a plan from scattered sources.

## User & Persona

Primary persona: a beginner at the gym with their own personal goal (the app's author as the first, named user). Context: first months of training; motivated to exercise but without the knowledge to build a plan. Moment they reach for the product: when they want to start training toward their goal but don't know where to begin or how to lay out their workouts.

## Success Criteria

### Primary
- A new user can sign up / log in, fill in their training profile (goal, days per week, available equipment, experience level, current lifts), receive one workout plan tailored to those parameters, save it, and browse it later — end to end.

### Secondary
- The app proposes 2–3 alternative plans to choose from instead of a single plan.

### Guardrails
- Account isolation: a user never sees another user's plans or data.
- Data privacy: profile data (weight, age, lifts) is visible only to the account owner.
- Plan soundness: a generated plan always respects the provided parameters (it never suggests exercises for equipment the user doesn't have, exceeds the chosen number of training days, or contradicts the stated goal).

## User Stories

### US-01: User generates a personalized plan from their profile

- **Given** a logged-in user who has filled in their training profile
- **When** they request a plan
- **Then** they receive one workout plan whose exercises, sets, reps, and suggested weights match their goal, experience level, available equipment, and chosen training days

#### Acceptance Criteria
- The plan uses only equipment the user marked as available
- The number of training sessions in the plan matches the chosen days per week
- Suggested weights are derived from the user's reported current lifts
- The user can save the plan and find it later among their saved plans

## Functional Requirements

### Account
- FR-001: User can create an account and log in. Priority: must-have
  > Socratic: Counter-argument considered: "auth is over-engineering for a solo MVP; a local profile would let the user try the generator instantly." Resolution: kept as must-have — account isolation and data privacy are guardrails that require auth, and multi-user is the longer-term direction. The friction cost is accepted.

### Profile
- FR-002: User can enter a training profile (goal, experience level, age, weight, available equipment, training days per week, current lifts for key exercises, optional endurance metric such as plank time). Priority: must-have
  > Socratic: No compelling counter-argument. These inputs are the raw material for personalization — without them there is no tailored plan. Stands as written. (Open follow-up: which fields are truly required vs optional, so the form doesn't block a beginner who doesn't know their current lifts — see Open Questions.)

### Plan generation
- FR-003: User can generate a workout plan tailored to their profile parameters. Priority: must-have
  > Socratic: Counter-argument considered: "this is the hardest, highest-risk piece; a curated template picker might deliver value faster, and plan quality is hard to validate." Resolution: kept — this is the core value (personalization) and the whole reason the product beats generic plans. Risk flagged: it is the highest-effort piece; a template-driven approach is a viable implementation fallback (see hand-off / tech-stack selection).

- FR-004: User can view the generated plan (exercises, sets, reps, suggested weights). Priority: must-have
  > Socratic: No compelling counter-argument. The user must see the plan to get value from it. Stands as written.

### Persistence
- FR-005: User can save a generated plan. Priority: must-have
  > Socratic: No compelling counter-argument. The plan must survive between sessions for the product to be useful. Stands as written.

- FR-006: User can browse their saved plans. Priority: must-have
  > Socratic: No compelling counter-argument. The user must be able to return to their plan later. Stands as written.

## Non-Functional Requirements

- Personal and body data (weight, age, current lifts) is never visible to anyone but the account owner.
- A saved plan remains retrievable on every subsequent login and is not lost.

## Business Logic

Treningo generates a personalized workout plan — exercise selection, frequency, sets, reps, and starting weights — by matching the user's goal, experience level, available equipment, number of training days, and current strength to training principles.

The rule consumes user-facing inputs: the training goal, experience level, body metrics (age, weight), the equipment the user has access to, how many days per week they want to train, their current lifts in a few key exercises, and optional endurance markers. None of these are optional decorations — each one constrains or shapes the resulting plan.

Its output is a single workout plan: a set of training sessions sized to the chosen weekly frequency, where each session lists exercises (limited to the available equipment), with sets, reps, and suggested starting weights. Starting weights are derived from the user's reported current lifts so the plan begins at an appropriate load rather than a generic default.

The user encounters the rule right after completing their profile: they request a plan and immediately see one tailored to their parameters, which they can then save and revisit. The personalization is the moment of value — the plan visibly reflects the inputs the user gave, which is what distinguishes it from a generic, one-size-fits-all plan pulled off the internet.

## Access Control

The user enters the app via login (account). The model is flat: each logged-in user can access only their own plans and training data; there are no roles (admin / trainer) in the MVP. An unauthenticated user has no access to the plan features.

## Non-Goals

- No manual plan editing in v1 — deferred to v2; keeps the MVP focused on generation + save.
- No multiple plan variants — v1 generates a single plan; choosing among 2–3 is a secondary, post-MVP enhancement.
- No progress tracking / workout journal — logging completed workouts, weight history, and progression over time is out of MVP scope.
- No social / trainer features — no sharing, community, or trainer roles in the MVP (flat, single-user-per-account model).

## Open Questions

1. **Which profile fields are required vs optional?** — so the input form doesn't block a true beginner who doesn't know their current lifts or plank time. Owner: user. By: before plan-generation work starts.
