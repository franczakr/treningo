import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getProfile } from "@/lib/services/profile";
import { savePlan } from "@/lib/services/plans";
import { planSchema } from "@/lib/schemas/plan";
import type { ProfileSnapshot } from "@/types";

export const prerender = false;

// JSON helper with the right content-type.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// POST /api/plan/save — auth-guard, re-validate the client-sent plan, snapshot the
// current profile, and persist a new plans row. Distinct status codes let the
// client island branch:
//   401 → not authenticated (island redirects to signin)
//   400 → malformed plan body (shape doesn't match planSchema)
//   422 → no profile saved
//   503 → server not configured (Supabase not wired)
//   500 → profile load / DB write failure
//   200 → { ok: true }
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "not_configured", message: "Zapisywanie planów nie jest skonfigurowane." }, 503);
  }

  // Re-validate the plan against the same schema used for generation — never trust
  // the client's shape.
  const body = (await context.request.json().catch(() => null)) as { plan?: unknown } | null;
  const parsed = planSchema.safeParse(body?.plan);
  if (!parsed.success) {
    return json({ error: "invalid_plan", message: "Nieprawidłowy plan." }, 400);
  }

  let profile;
  try {
    profile = await getProfile(supabase, user.id);
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan save: profile load failed:", error);
    return json({ error: "profile_load_failed", message: "Nie udało się wczytać profilu. Spróbuj ponownie." }, 500);
  }

  if (!profile) {
    return json({ error: "profile_required", message: "Najpierw uzupełnij profil treningowy." }, 422);
  }

  // Snapshot = the profile input fields only (drop DB-managed/identity columns).
  const { id: _id, user_id: _userId, created_at: _createdAt, updated_at: _updatedAt, ...snapshot } = profile;
  const profileSnapshot: ProfileSnapshot = snapshot;

  const { error } = await savePlan(supabase, user.id, parsed.data, profileSnapshot);
  if (error) {
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan save failed:", error);
    return json({ error: "save_failed", message: "Nie udało się zapisać planu. Spróbuj ponownie." }, 500);
  }

  return json({ ok: true }, 200);
};
