import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createGemini } from "@/lib/gemini";
import { getProfile } from "@/lib/services/profile";
import { generatePlan, PlanGenerationError } from "@/lib/services/plan-generator";

export const prerender = false;

// JSON helper with the right content-type.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// POST /api/plan/generate — auth-guard, load the profile, generate a plan.
// Distinct status codes let the client island branch:
//   401 → not authenticated (island redirects to signin)
//   422 → no profile saved (island redirects to /training-profile)
//   503 → server not configured (Supabase/Gemini key missing)
//   500 → hard generation failure (island shows error + retry)
//   200 → { plan, violations, ok }
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const gemini = createGemini();
  if (!supabase || !gemini) {
    return json({ error: "not_configured", message: "Generowanie planów nie jest skonfigurowane." }, 503);
  }

  let profile;
  try {
    profile = await getProfile(supabase, user.id);
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan generation: profile load failed:", error);
    return json({ error: "profile_load_failed", message: "Nie udało się wczytać profilu. Spróbuj ponownie." }, 500);
  }

  if (!profile) {
    return json({ error: "profile_required", message: "Najpierw uzupełnij profil treningowy." }, 422);
  }

  try {
    const result = await generatePlan(gemini, profile);
    return json(result, 200);
  } catch (error) {
    // Hard failure (API error / blocked prompt / unparseable output). Log the raw cause
    // server-side; return a friendly Polish message.
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan generation failed:", error instanceof PlanGenerationError ? (error.cause ?? error) : error);
    return json({ error: "generation_failed", message: "Nie udało się wygenerować planu. Spróbuj ponownie." }, 500);
  }
};
