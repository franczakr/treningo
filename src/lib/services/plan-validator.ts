// Plan soundness validator (FR-003 guardrails). Pure, synchronous function over
// a parsed plan + the profile — no LLM call — so the guardrail logic is unit-
// testable in isolation. Returns the list of violations; an empty list means the
// plan is sound.
//
// The equipment and day-count checks are hard and deterministic. The goal check
// is intentionally lenient: goal-consistency cannot be fully decided
// structurally, so we only catch gross structural problems (empty plan, empty
// sessions, absurd volume) and rely on the prompt + model quality for the rest.

import type { TrainingProfile, Violation, WorkoutPlan } from "@/types";

// Loose bounds for the structural goal sanity check — not goal-specific tuning,
// just "this clearly isn't a real training session" detection.
const MIN_EXERCISES_PER_SESSION = 1;
const MAX_EXERCISES_PER_SESSION = 15;

export function validatePlan(plan: WorkoutPlan, profile: TrainingProfile): Violation[] {
  const violations: Violation[] = [];

  // (a) Equipment guardrail: every exercise's equipment tag must be available.
  const available = new Set<string>(profile.equipment);
  const used = new Set<string>();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      if (!available.has(exercise.equipment)) {
        used.add(exercise.equipment);
      }
    }
  }
  if (used.size > 0) {
    violations.push({
      guardrail: "equipment",
      message: `Plan używa sprzętu spoza listy dostępnego użytkownikowi: ${[...used].join(", ")}. Użyj wyłącznie: ${profile.equipment.join(", ")}.`,
    });
  }

  // (b) Day-count guardrail: exactly training_days_per_week sessions.
  if (plan.sessions.length !== profile.training_days_per_week) {
    violations.push({
      guardrail: "day_count",
      message: `Plan ma ${plan.sessions.length} sesji, a powinien mieć dokładnie ${profile.training_days_per_week} (liczba dni treningowych użytkownika).`,
    });
  }

  // (c) Goal-consistency: lenient structural check only.
  if (plan.sessions.length === 0) {
    violations.push({
      guardrail: "goal",
      message: "Plan nie zawiera żadnej sesji treningowej.",
    });
  } else {
    const badSession = plan.sessions.find(
      (s) => s.exercises.length < MIN_EXERCISES_PER_SESSION || s.exercises.length > MAX_EXERCISES_PER_SESSION,
    );
    if (badSession) {
      violations.push({
        guardrail: "goal",
        message: `Sesja "${badSession.name}" ma nieprawidłową liczbę ćwiczeń (${badSession.exercises.length}). Każda sesja powinna mieć od ${MIN_EXERCISES_PER_SESSION} do ${MAX_EXERCISES_PER_SESSION} ćwiczeń.`,
      });
    }
  }

  return violations;
}
