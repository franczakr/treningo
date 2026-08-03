import { describe, expect, it } from "vitest";
import { getProfile, upsertProfile } from "@/lib/services/profile";
import { createTestUser } from "@/lib/test-helpers/integration-users";
import type { ProfileUpsertDto } from "@/types";

// Real-database acceptance-direction test for Risk #5. Phase 1
// (profile.test.ts) already exhaustively proves the REJECTION direction:
// every value a DB CHECK would reject is rejected earlier by zod. This
// suite proves the other half: every value zod's upper/lower bounds
// accept is also actually accepted by the real database — not assumed
// from reading the schema and migration side by side. No mocked client.
describe("profiles persistence — schema-boundary acceptance (Risk #5)", () => {
  it("a profile at the schema's upper boundary round-trips unchanged", async () => {
    const user = await createTestUser();
    const dto: ProfileUpsertDto = {
      goal: "strength",
      experience_level: "advanced",
      age: 100,
      weight_kg: 500,
      training_days_per_week: 7,
      equipment: ["barbell", "dumbbells", "machines", "pull_up_bar", "kettlebell", "resistance_bands"],
      squat_kg: 1000,
      bench_kg: 1000,
      deadlift_kg: 1000,
      ohp_kg: 1000,
      plank_seconds: 3600,
    };

    const { error } = await upsertProfile(user.client, user.userId, dto);
    expect(error).toBeNull();

    const saved = await getProfile(user.client, user.userId);
    expect(saved).toMatchObject(dto);
  });

  it("a profile at the schema's lower boundary round-trips unchanged", async () => {
    const user = await createTestUser();
    const dto: ProfileUpsertDto = {
      goal: "fat_loss",
      experience_level: "beginner",
      age: 13,
      weight_kg: 0.1,
      training_days_per_week: 1,
      equipment: ["bodyweight_only"],
      squat_kg: null,
      bench_kg: null,
      deadlift_kg: null,
      ohp_kg: null,
      plank_seconds: null,
    };

    const { error } = await upsertProfile(user.client, user.userId, dto);
    expect(error).toBeNull();

    const saved = await getProfile(user.client, user.userId);
    expect(saved).toMatchObject(dto);
  });
});
