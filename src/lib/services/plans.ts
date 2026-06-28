// Saved-plans data-access service (S-03) — encapsulates the Supabase write so the
// API route stays thin, mirroring `profile.ts`. RLS (deny-by-default,
// `auth.uid() = user_id`) is the hard isolation boundary; this service additionally
// always derives `user_id` from the authenticated session, never from the client
// payload. Unlike profiles this is a plain insert (no upsert): many plans per user.

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { WorkoutPlan, ProfileSnapshot } from "@/types";

type Client = SupabaseClient<Database>;

// Insert a new saved plan row for the user. The plan is stored whole as jsonb
// alongside a server-derived snapshot of the profile it was generated from.
export async function savePlan(
  supabase: Client,
  userId: string,
  plan: WorkoutPlan,
  profileSnapshot: ProfileSnapshot,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("plans").insert({
    user_id: userId,
    plan,
    profile_snapshot: profileSnapshot,
  });

  return { error };
}
