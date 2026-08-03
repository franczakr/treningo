import { beforeAll, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { getPlans } from "@/lib/services/plans";
import { upsertProfile } from "@/lib/services/profile";
import { createTestUser, type TestUser } from "@/lib/test-helpers/integration-users";
import { EXERCISES_MAX, SESSIONS_MAX } from "@/lib/schemas/plan";

// Real-endpoint integration test for Risk #6: an oversized plan must be
// rejected by POST /api/plan/save — with nothing persisted — because
// nothing else on this path enforces a size limit (savePlan() does no
// validation, plan-validator.ts is never called from save.ts, and the
// database has no array-length CHECK). The only enforcement point is
// planSchema's cap (Phase 1), so this test must drive the real route
// handler, not just the schema in isolation.
//
// The real createClient() (src/lib/supabase.ts) reads astro:env/server
// (unresolvable under plain-node Vitest) and needs a real HTTP
// cookie-based session (Phase 2 already avoided this for the same
// reason). So only that one boundary is substituted — with the real,
// already-authenticated integration-test client — everything else (auth
// guard, schema validation, profile lookup, savePlan, the real database)
// runs for real.
let currentClient: SupabaseClient<Database> | null = null;

vi.mock("@/lib/supabase", () => ({
  createClient: () => currentClient,
}));

const { POST } = await import("./save");

function fakeContext(userId: string, planBody: unknown): APIContext {
  return {
    locals: { user: { id: userId } },
    request: new Request("http://localhost/api/plan/save", {
      method: "POST",
      body: JSON.stringify({ plan: planBody }),
    }),
    cookies: {},
  } as unknown as APIContext;
}

function sessionWith(exerciseCount: number) {
  return {
    name: "Trening A",
    focus: "całe ciało",
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({
      name: `Ćwiczenie ${i + 1}`,
      equipment: "barbell",
      sets: 3,
      reps: "8-10",
      suggested_weight: "orientacyjnie 60 kg",
      rest_seconds: 90,
    })),
  };
}

describe("POST /api/plan/save — array-length caps enforced before persistence (Risk #6)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
    currentClient = user.client;

    // save.ts 422s without a saved profile.
    const { error } = await upsertProfile(user.client, user.userId, {
      goal: "strength",
      experience_level: "beginner",
      age: 30,
      weight_kg: 80,
      training_days_per_week: 1,
      equipment: ["barbell"],
      squat_kg: null,
      bench_kg: null,
      deadlift_kg: null,
      ohp_kg: null,
      plank_seconds: null,
    });
    if (error) throw new Error(`Failed to seed profile: ${error.message}`);
  });

  it(`rejects a plan with ${SESSIONS_MAX + 1} sessions and persists nothing`, async () => {
    const plan = { sessions: Array.from({ length: SESSIONS_MAX + 1 }, () => sessionWith(1)) };

    const response = await POST(fakeContext(user.userId, plan));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_plan");

    const rows = await getPlans(user.client, user.userId);
    expect(rows).toHaveLength(0);
  });

  it(`rejects a session with ${EXERCISES_MAX + 1} exercises and persists nothing`, async () => {
    const plan = { sessions: [sessionWith(EXERCISES_MAX + 1)] };

    const response = await POST(fakeContext(user.userId, plan));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_plan");

    const rows = await getPlans(user.client, user.userId);
    expect(rows).toHaveLength(0);
  });

  it("positive control: a plan at exactly the caps is accepted and persisted", async () => {
    const plan = { sessions: Array.from({ length: SESSIONS_MAX }, () => sessionWith(1)) };

    const response = await POST(fakeContext(user.userId, plan));
    expect(response.status).toBe(200);

    const rows = await getPlans(user.client, user.userId);
    expect(rows).toHaveLength(1);
  });
});
