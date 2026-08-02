import { describe, expect, it } from "vitest";
import { createTestUser } from "@/lib/test-helpers/integration-users";

// Real-database smoke test: proves the whole chain (local Supabase
// reachable, signup works, a real session is issued) before any isolation
// assertion in later files relies on it.
describe("createTestUser", () => {
  it("creates two distinct, real signed-in users against the local stack", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    expect(userA.userId).toBeTruthy();
    expect(userB.userId).toBeTruthy();
    expect(userA.userId).not.toBe(userB.userId);

    const { data: sessionA } = await userA.client.auth.getUser();
    expect(sessionA.user?.id).toBe(userA.userId);

    const { data: sessionB } = await userB.client.auth.getUser();
    expect(sessionB.user?.id).toBe(userB.userId);
  });
});
