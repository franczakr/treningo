import { describe, expect, it } from "vitest";
import { validatePlan } from "@/lib/services/plan-validator";
import type { PlanExercise, PlanSession, TrainingProfile, Violation, WorkoutPlan } from "@/types";

// Literal profile fixture — every field is hand-set here, never derived from
// the validator under test (avoids the oracle problem: expected guardrail
// sets below come from reading this profile + the PRD guardrail sentence,
// never from re-implementing validatePlan's own logic).
const baseProfile: TrainingProfile = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-06-27T00:00:00.000Z",
  updated_at: "2026-06-27T00:00:00.000Z",
  goal: "strength",
  experience_level: "beginner",
  age: 30,
  weight_kg: 80,
  training_days_per_week: 3,
  equipment: ["barbell", "dumbbells"],
  squat_kg: null,
  bench_kg: null,
  deadlift_kg: null,
  ohp_kg: null,
  plank_seconds: null,
};

function exercise(overrides: Partial<PlanExercise> = {}): PlanExercise {
  return {
    name: "Przysiad ze sztangą",
    equipment: "barbell",
    sets: 3,
    reps: "8-10",
    suggested_weight: "orientacyjnie 60 kg",
    rest_seconds: 90,
    ...overrides,
  };
}

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return {
    name: "Trening A",
    focus: "całe ciało",
    exercises: [exercise()],
    ...overrides,
  };
}

// Sound baseline: exactly 3 sessions (matches training_days_per_week), every
// exercise tagged with equipment ⊆ profile.equipment.
const soundPlan: WorkoutPlan = {
  sessions: [session(), session({ name: "Trening B" }), session({ name: "Trening C" })],
};

function guardrails(violations: Violation[]): Violation["guardrail"][] {
  return violations.map((v) => v.guardrail);
}

describe("validatePlan", () => {
  it("reports no violations for a plan that matches the profile", () => {
    expect(validatePlan(soundPlan, baseProfile)).toEqual([]);
  });

  it("flags equipment outside the profile's set", () => {
    const plan: WorkoutPlan = {
      sessions: [
        session({ exercises: [exercise({ equipment: "machines" })] }),
        session({ name: "Trening B" }),
        session({ name: "Trening C" }),
      ],
    };
    expect(guardrails(validatePlan(plan, baseProfile))).toEqual(["equipment"]);
  });

  it("includes the offending equipment tag in the violation message (fed back to the model on retry)", () => {
    const plan: WorkoutPlan = {
      sessions: [
        session({ exercises: [exercise({ equipment: "machines" })] }),
        session({ name: "Trening B" }),
        session({ name: "Trening C" }),
      ],
    };
    const [violation] = validatePlan(plan, baseProfile);
    expect(violation.message).toContain("machines");
  });

  it("collapses multiple offending exercises across sessions into a single equipment violation", () => {
    const plan: WorkoutPlan = {
      sessions: [
        session({
          exercises: [exercise({ equipment: "machines" }), exercise({ equipment: "kettlebell" })],
        }),
        session({ name: "Trening B", exercises: [exercise({ equipment: "resistance_bands" })] }),
        session({ name: "Trening C" }),
      ],
    };
    expect(guardrails(validatePlan(plan, baseProfile))).toEqual(["equipment"]);
  });

  it("flags one fewer session than training_days_per_week", () => {
    const plan: WorkoutPlan = { sessions: [session(), session({ name: "Trening B" })] };
    expect(guardrails(validatePlan(plan, baseProfile))).toEqual(["day_count"]);
  });

  it("flags one more session than training_days_per_week", () => {
    const plan: WorkoutPlan = {
      sessions: [
        session(),
        session({ name: "Trening B" }),
        session({ name: "Trening C" }),
        session({ name: "Trening D" }),
      ],
    };
    expect(guardrails(validatePlan(plan, baseProfile))).toEqual(["day_count"]);
  });

  it("flags both equipment and day_count when a plan breaks both guardrails", () => {
    const plan: WorkoutPlan = {
      sessions: [session({ exercises: [exercise({ equipment: "machines" })] }), session({ name: "Trening B" })],
    };
    expect(guardrails(validatePlan(plan, baseProfile))).toEqual(["equipment", "day_count"]);
  });

  it("negative control: swapping one exercise's tag off the sound baseline changes the guardrail set", () => {
    const mutated: WorkoutPlan = {
      sessions: [
        session({ exercises: [exercise({ equipment: "pull_up_bar" })] }),
        session({ name: "Trening B" }),
        session({ name: "Trening C" }),
      ],
    };
    expect(validatePlan(soundPlan, baseProfile)).toEqual([]);
    expect(guardrails(validatePlan(mutated, baseProfile))).toEqual(["equipment"]);
  });
});
