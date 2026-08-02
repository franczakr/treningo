// Shared helper for integration tests that need a real, signed-in throwaway
// user against a LOCAL Supabase stack (never the hosted project). Used by
// every `*.integration.test.ts` file that exercises RLS/account isolation.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

// A fixed password is fine — each user gets a unique, random email per test
// run, so there is no credential to protect and no collision risk.
const TEST_PASSWORD = "Test1234!";

export interface TestUser {
  client: SupabaseClient<Database>;
  userId: string;
}

// Signs up a brand-new user against the local stack and returns a client
// authenticated as that user, plus their id. Throws loudly on failure — a
// broken local stack (Docker not running, wrong SUPABASE_URL) should fail
// the test immediately, not silently produce an unauthenticated client.
export async function createTestUser(): Promise<TestUser> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_KEY are not set. Populate .env.test.local from `supabase start`'s output (see .env.test.local.example).",
    );
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Unique per run — the local Docker volume persists across `start`/`stop`,
  // so a fixed email would fail with "User already registered" on rerun.
  const email = `test-${crypto.randomUUID()}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: TEST_PASSWORD });
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message ?? "no user returned"}`);
  }

  return { client, userId: data.user.id };
}

// A client with no signed-in session — exercises the `anon` role, which
// every RLS policy in this project denies by construction (no `anon`
// policy exists on any per-user table).
export function createAnonClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY are not set. See .env.test.local.example.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
