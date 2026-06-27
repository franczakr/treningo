import type { APIRoute, APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { profileSchema } from "@/lib/schemas/profile";
import { upsertProfile } from "@/lib/services/profile";

export const prerender = false;

const PROFILE_PATH = "/training-profile";

function redirectWithError(context: APIContext, message: string) {
  return context.redirect(`${PROFILE_PATH}?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  // Server-side auth guard: the form page is behind middleware, but the API route
  // is not — reject unauthenticated writes here too.
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "Supabase is not configured");
  }

  const form = await context.request.formData();

  // Equipment is a native multi-select (checkboxes sharing name="equipment").
  const raw = {
    goal: form.get("goal"),
    experience_level: form.get("experience_level"),
    age: form.get("age"),
    weight_kg: form.get("weight_kg"),
    training_days_per_week: form.get("training_days_per_week"),
    equipment: form.getAll("equipment"),
    squat_kg: form.get("squat_kg"),
    bench_kg: form.get("bench_kg"),
    deadlift_kg: form.get("deadlift_kg"),
    ohp_kg: form.get("ohp_kg"),
    plank_seconds: form.get("plank_seconds"),
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid profile data";
    return redirectWithError(context, message);
  }

  const { error } = await upsertProfile(supabase, user.id, parsed.data);
  if (error) {
    // Keep the raw DB detail server-side; show the user a friendly message.
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Profile upsert failed:", error);
    return redirectWithError(context, "Nie udało się zapisać profilu. Spróbuj ponownie.");
  }

  return context.redirect(`${PROFILE_PATH}?saved=1`);
};
