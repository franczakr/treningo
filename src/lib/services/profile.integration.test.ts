import { beforeAll, describe, expect, it } from "vitest";
import { getProfile, upsertProfile } from "@/lib/services/profile";
import { createAnonClient, createTestUser, type TestUser } from "@/lib/test-helpers/integration-users";
import type { ProfileUpsertDto } from "@/types";

// Real-database isolation test: user B (and an anonymous client) must never
// read, update, or delete user A's profile — through the app's own
// getProfile, and through the raw Postgrest client for update/delete, which
// upsertProfile never exposes cross-user (it always writes the caller's own
// row). No mocked client anywhere below; every assertion runs against real
// RLS + the service layer's explicit userId filter.
describe("profiles account isolation", () => {
  let userA: TestUser;
  let userB: TestUser;

  const profileDto: ProfileUpsertDto = {
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

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();

    const { error } = await upsertProfile(userA.client, userA.userId, profileDto);
    if (error) throw new Error(`Failed to seed user A's profile: ${error.message}`);
  });

  it("negative control: user A can read their own profile", async () => {
    const profile = await getProfile(userA.client, userA.userId);
    expect(profile?.user_id).toBe(userA.userId);
    expect(profile?.goal).toBe("strength");
  });

  it("user B cannot read user A's profile", async () => {
    const profile = await getProfile(userB.client, userA.userId);
    expect(profile).toBeNull();
  });

  it("an anonymous client cannot read user A's profile", async () => {
    const anon = createAnonClient();
    const profile = await getProfile(anon, userA.userId);
    expect(profile).toBeNull();
  });

  it("user B cannot update user A's profile", async () => {
    const { data } = await userB.client.from("profiles").update({ age: 99 }).eq("user_id", userA.userId).select();
    expect(data).toEqual([]);

    // Confirm the row is genuinely unmutated, as user A.
    const profile = await getProfile(userA.client, userA.userId);
    expect(profile?.age).toBe(30);
  });

  it("user B cannot delete user A's profile", async () => {
    const { data } = await userB.client.from("profiles").delete().eq("user_id", userA.userId).select();
    expect(data).toEqual([]);

    // Confirm the row still exists, as user A.
    const profile = await getProfile(userA.client, userA.userId);
    expect(profile).not.toBeNull();
  });
});
