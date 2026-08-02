import { beforeAll, describe, expect, it } from "vitest";
import { getPlanById, getPlans, savePlan } from "@/lib/services/plans";
import { createAnonClient, createTestUser, type TestUser } from "@/lib/test-helpers/integration-users";
import type { ProfileSnapshot, WorkoutPlan } from "@/types";

// Real-database isolation test: user B (and an anonymous client) must never
// list, read, update, or delete user A's saved plan — through the app's own
// getPlans/getPlanById, and through the raw Postgrest client for
// update/delete, which no service function exposes cross-user (there is no
// app-level plan-editing UI at all). No mocked client anywhere below.
describe("plans account isolation", () => {
  let userA: TestUser;
  let userB: TestUser;
  let planId: string;

  const profileSnapshot: ProfileSnapshot = {
    goal: "strength",
    experience_level: "beginner",
    age: 30,
    weight_kg: 80,
    training_days_per_week: 3,
    equipment: ["barbell"],
    squat_kg: null,
    bench_kg: null,
    deadlift_kg: null,
    ohp_kg: null,
    plank_seconds: null,
  };

  const plan: WorkoutPlan = {
    sessions: [
      {
        name: "Trening A",
        focus: "całe ciało",
        exercises: [
          {
            name: "Przysiad ze sztangą",
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

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();

    const { error } = await savePlan(userA.client, userA.userId, plan, profileSnapshot);
    if (error) throw new Error(`Failed to seed user A's plan: ${error.message}`);

    // savePlan doesn't return the inserted id — read it back as user A.
    const rows = await getPlans(userA.client, userA.userId);
    if (rows.length === 0) throw new Error("Seeded plan not found via getPlans");
    planId = rows[0].id;
  });

  it("negative control: user A can list and read their own plan", async () => {
    const list = await getPlans(userA.client, userA.userId);
    expect(list).toHaveLength(1);

    const single = await getPlanById(userA.client, userA.userId, planId);
    expect(single?.id).toBe(planId);
  });

  it("user B's plan list never contains user A's plan", async () => {
    const list = await getPlans(userB.client, userA.userId);
    expect(list).toEqual([]);
  });

  it("user B cannot read user A's plan by id (matches production's not-found handling)", async () => {
    const single = await getPlanById(userB.client, userA.userId, planId);
    expect(single).toBeNull();
  });

  it("an anonymous client cannot read user A's plan by id", async () => {
    const anon = createAnonClient();
    const single = await getPlanById(anon, userA.userId, planId);
    expect(single).toBeNull();
  });

  it("user B cannot update user A's plan", async () => {
    const { data } = await userB.client
      .from("plans")
      .update({ plan: { sessions: [] } })
      .eq("id", planId)
      .select();
    expect(data).toEqual([]);

    // Confirm the row is genuinely unmutated, as user A.
    const single = await getPlanById(userA.client, userA.userId, planId);
    expect(single?.plan.sessions).toHaveLength(1);
  });

  it("user B cannot delete user A's plan", async () => {
    const { data } = await userB.client.from("plans").delete().eq("id", planId).select();
    expect(data).toEqual([]);

    // Confirm the row still exists, as user A.
    const single = await getPlanById(userA.client, userA.userId, planId);
    expect(single).not.toBeNull();
  });
});
