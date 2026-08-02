import { describe, expect, it } from "vitest";
import { planSchema } from "@/lib/schemas/plan";

const NUL = String.fromCharCode(0);

// A structurally-valid plan matching planSchema's shape.
function validPlanWith(exerciseName: string) {
  return {
    sessions: [
      {
        name: "Trening A",
        focus: "całe ciało",
        exercises: [
          {
            name: exerciseName,
            equipment: "barbell",
            sets: 3,
            reps: "8-10",
            suggested_weight: "orientacyjnie 60 kg",
            rest_seconds: 90,
          },
        ],
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
