import { describe, expect, it } from "vitest";
import { EXERCISES_MAX, planSchema, SESSIONS_MAX } from "@/lib/schemas/plan";

const NUL = String.fromCharCode(0);

// A single structurally-valid exercise.
function exercise(name: string) {
  return {
    name,
    equipment: "barbell",
    sets: 3,
    reps: "8-10",
    suggested_weight: "orientacyjnie 60 kg",
    rest_seconds: 90,
  };
}

// A single structurally-valid session with `exerciseCount` exercises.
function sessionWith(exerciseCount: number) {
  return {
    name: "Trening A",
    focus: "całe ciało",
    exercises: Array.from({ length: exerciseCount }, (_, i) => exercise(`Ćwiczenie ${i + 1}`)),
  };
}

// A structurally-valid plan matching planSchema's shape.
function validPlanWith(exerciseName: string) {
  return {
    sessions: [
      {
        name: "Trening A",
        focus: "całe ciało",
        exercises: [exercise(exerciseName)],
      },
    ],
  };
}

describe("planSchema — Defect B (NUL code point)", () => {
  // Postgres jsonb cannot store the NUL code point. Before the fix in
  // src/lib/schemas/plan.ts, an unconstrained z.string() accepted it and the
  // value would only fail at the database insert (500 save_failed) — the
  // one live "schema accepts, database rejects" case found in Risk #5.
  it("rejects a NUL code point embedded in a plan text field", () => {
    const plan = validPlanWith(`Przysiad${NUL}ze sztangą`);
    expect(planSchema.safeParse(plan).success).toBe(false);
  });

  it("accepts the same plan with the NUL code point removed", () => {
    const plan = validPlanWith("Przysiad ze sztangą");
    expect(planSchema.safeParse(plan).success).toBe(true);
  });
});

describe("planSchema — array-length caps (Risk #6)", () => {
  // The save endpoint never calls plan-validator.ts, and the database has no
  // array-length CHECK — planSchema's .max() is the only thing that can ever
  // reject an oversized plan before persistence (see
  // context/changes/testing-persistence-boundaries/research.md).
  it(`accepts exactly ${SESSIONS_MAX} sessions`, () => {
    const plan = { sessions: Array.from({ length: SESSIONS_MAX }, () => sessionWith(1)) };
    expect(planSchema.safeParse(plan).success).toBe(true);
  });

  it(`rejects ${SESSIONS_MAX + 1} sessions`, () => {
    const plan = { sessions: Array.from({ length: SESSIONS_MAX + 1 }, () => sessionWith(1)) };
    expect(planSchema.safeParse(plan).success).toBe(false);
  });

  it(`accepts exactly ${EXERCISES_MAX} exercises in a session`, () => {
    const plan = { sessions: [sessionWith(EXERCISES_MAX)] };
    expect(planSchema.safeParse(plan).success).toBe(true);
  });

  it(`rejects ${EXERCISES_MAX + 1} exercises in a session`, () => {
    const plan = { sessions: [sessionWith(EXERCISES_MAX + 1)] };
    expect(planSchema.safeParse(plan).success).toBe(false);
  });
});
