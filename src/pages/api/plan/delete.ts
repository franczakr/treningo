import type { APIRoute, APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { deletePlan } from "@/lib/services/plans";

export const prerender = false;

const DASHBOARD_PATH = "/dashboard";

function redirectWithError(context: APIContext, message: string) {
  return context.redirect(`${DASHBOARD_PATH}?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  // Server-side auth guard: the form pages (dashboard, plan/[id]) are behind
  // middleware, but the API route is not — reject unauthenticated writes here too.
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "Supabase is not configured");
  }

  const form = await context.request.formData();
  const planId = form.get("plan_id");
  if (typeof planId !== "string" || planId.length === 0) {
    return redirectWithError(context, "Nie udało się usunąć planu.");
  }

  const { error } = await deletePlan(supabase, user.id, planId);
  if (error) {
    // Keep the raw DB detail server-side; show the user a friendly message.
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan delete failed:", error);
    return redirectWithError(context, "Nie udało się usunąć planu. Spróbuj ponownie.");
  }

  return context.redirect(DASHBOARD_PATH);
};
