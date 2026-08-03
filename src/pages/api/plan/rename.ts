import type { APIRoute, APIContext } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { renamePlan } from "@/lib/services/plans";

const renameSchema = z.object({
  // Authored message on purpose: `issues[0].message` below is user-facing, and
  // zod's default ("Invalid UUID") is English internal detail (Risk #7).
  plan_id: z.uuid("Nieprawidłowy identyfikator planu."),
  // Empty/whitespace-only input clears the custom name (falls back to the
  // goal label in the UI) rather than being rejected as invalid.
  // Authored type-failure message too: `form.get("name")` can be a File, and
  // zod's default for that ("Invalid input: expected string, received File") is
  // English internal detail on a user-facing path (Risk #7).
  name: z
    .string("Nieprawidłowa nazwa planu.")
    .trim()
    .max(100, "Nazwa jest za długa (maks. 100 znaków).")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

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
    return redirectWithError(context, "Zmiana nazwy planu nie jest skonfigurowana.");
  }

  const form = await context.request.formData();
  const parsed = renameSchema.safeParse({
    plan_id: form.get("plan_id"),
    name: form.get("name") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Nie udało się zmienić nazwy planu.";
    return redirectWithError(context, message);
  }
  const { plan_id: planId, name } = parsed.data;

  const returnTo = form.get("return_to");
  const redirectPath =
    typeof returnTo === "string" && returnTo.startsWith(`/plan/${planId}`) ? returnTo : DASHBOARD_PATH;

  const { error } = await renamePlan(supabase, user.id, planId, name);
  if (error) {
    // Keep the raw DB detail server-side; show the user a friendly message.
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Plan rename failed:", error);
    return context.redirect(
      `${redirectPath}?error=${encodeURIComponent("Nie udało się zmienić nazwy planu. Spróbuj ponownie.")}`,
    );
  }

  return context.redirect(redirectPath);
};
