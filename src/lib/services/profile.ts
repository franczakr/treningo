// Profile data-access service — encapsulates the Supabase reads/writes so the API
// route and page stay thin. RLS (deny-by-default, `auth.uid() = user_id`) is the
// hard isolation boundary; this service additionally always derives `user_id`
// from the authenticated session, never from the client payload.

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { TrainingProfile, ProfileUpsertDto } from "@/types";

type Client = SupabaseClient<Database>;

// Single row for the given user, or null if none saved yet.
export async function getProfile(supabase: Client, userId: string): Promise<TrainingProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

// Insert-or-update the user's single profile row. Keys on `user_id` (unique), so
// re-saving overwrites rather than duplicating.
export async function upsertProfile(
  supabase: Client,
  userId: string,
  dto: ProfileUpsertDto,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("profiles").upsert({ ...dto, user_id: userId }, { onConflict: "user_id" });

  return { error };
}
