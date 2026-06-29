// Saved-plans data-access service (S-03) — encapsulates the Supabase write so the
// API route stays thin, mirroring `profile.ts`. RLS (deny-by-default,
// `auth.uid() = user_id`) is the hard isolation boundary; this service additionally
// always derives `user_id` from the authenticated session, never from the client
// payload. Unlike profiles this is a plain insert (no upsert): many plans per user.

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { WorkoutPlan, ProfileSnapshot, SavedPlan } from "@/types";

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

// All saved plans for the user, newest first (S-04). The jsonb columns are typed
// `Json` in the generated row; cast to the domain `SavedPlan` shape (the plan was
// validated against `planSchema` on save). RLS additionally scopes to the caller.
export async function getPlans(supabase: Client, userId: string): Promise<SavedPlan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  return data as SavedPlan[];
}

// A single saved plan by id, scoped to the user (defense in depth alongside RLS).
// Returns null for a foreign or nonexistent id so the page can treat it as
// "not found" rather than throwing.
export async function getPlanById(supabase: Client, userId: string, planId: string): Promise<SavedPlan | null> {
  const { data, error } = await supabase.from("plans").select("*").eq("user_id", userId).eq("id", planId).maybeSingle();

  if (error) {
    throw error;
  }
  return data as SavedPlan | null;
}
