import { beforeAll, describe, expect, it } from "vitest";
import { getPlanById, getPlans, savePlan } from "@/lib/services/plans";
import { createTestUser, type TestUser } from "@/lib/test-helpers/integration-users";
import { planSchema } from "@/lib/schemas/plan";
import type { ProfileSnapshot, WorkoutPlan } from "@/types";

// Real-database round-trip test: a saved plan's `plan` and `profile_snapshot`
// content must come back byte-for-byte identical, through BOTH read paths
// (getPlanById and getPlans — dashboard.astro uses the latter). The existing
// isolation suite (plans.integration.test.ts) already does a save-then-read
// as a side effect, but only asserts `id` and list length — that is not
// evidence for Risk #3 (shape drift) or Risk #5 (schema/DB acceptance
// parity for the plans table, which has zero DB CHECK constraints and so
// collapses into this same content-fidelity question). No mocked client
// anywhere below.
describe("plans persistence round-trip", () => {
  let userA: TestUser;
  let planId: string;

  // Deliberately richer than a single-exercise fixture — two sessions, one
  // with two exercises, and a profile snapshot mixing non-null and null
  // optional lift fields — so a dropped, renamed, or null-coerced field
  // would be caught.
  const seededSnapshot: ProfileSnapshot = {
    goal: "muscle_gain",
    experience_level: "intermediate",
    age: 27,
    weight_kg: 74.5,
    training_days_per_week: 2,
    equipment: ["barbell", "dumbbells"],
    squat_kg: 100,
    bench_kg: null,
    deadlift_kg: 140,
    ohp_kg: null,
    plank_seconds: 90,
  };

  const seededPlan: WorkoutPlan = {
    sessions: [
      {
        name: "Trening A — góra",
        focus: "klatka i triceps",
        exercises: [
          {
            name: "Wyciskanie sztangi na ławce",
            equipment: "barbell",
            sets: 4,
            reps: "6-8",
            suggested_weight: "orientacyjnie 60 kg",
            rest_seconds: 120,
          },
          {
            name: "Pompki",
            equipment: "bodyweight_only",
            sets: 3,
            reps: "do upadku",
            suggested_weight: "masa ciała",
            rest_seconds: 60,
          },
        ],
      },
      {
        name: "Trening B — dół",
        focus: "nogi",
        exercises: [
          {
            name: "Martwy ciąg",
            equipment: "barbell",
            sets: 3,
            reps: "5",
            suggested_weight: "orientacyjnie 100 kg",
            rest_seconds: 150,
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    userA = await createTestUser();

    const { error } = await savePlan(userA.client, userA.userId, seededPlan, seededSnapshot);
    if (error) throw new Error(`Failed to seed plan: ${error.message}`);

    // savePlan doesn't return the inserted id — read it back once to get it.
    const rows = await getPlans(userA.client, userA.userId);
    if (rows.length === 0) throw new Error("Seeded plan not found via getPlans");
    planId = rows[0].id;
  });

  it("getPlanById returns plan and profile_snapshot deep-equal to what was saved", async () => {
    const single = await getPlanById(userA.client, userA.userId, planId);

    expect(single?.plan).toEqual(seededPlan);
    expect(single?.profile_snapshot).toEqual(seededSnapshot);
    // Still parses against the current schema — a version-drift regression
    // would surface here even without a schema-version column.
    expect(planSchema.safeParse(single?.plan).success).toBe(true);
  });

  it("getPlans list entry is also deep-equal, not just present (dashboard.astro's read path)", async () => {
    const list = await getPlans(userA.client, userA.userId);
    const entry = list.find((row) => row.id === planId);

    expect(entry?.plan).toEqual(seededPlan);
    expect(entry?.profile_snapshot).toEqual(seededSnapshot);
    expect(planSchema.safeParse(entry?.plan).success).toBe(true);
  });
});
