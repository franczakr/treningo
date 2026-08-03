import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AUTH_NOT_CONFIGURED_MESSAGE, authErrorMessage, SIGNUP_FALLBACK_MESSAGE } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_NOT_CONFIGURED_MESSAGE)}`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Never echo the provider's own message — it can carry infrastructure
    // detail. Map the code to Polish, keep the raw error server-side.
    // eslint-disable-next-line no-console -- deliberate server-side error log
    console.error("Sign-up failed:", error);
    const message = authErrorMessage(error, SIGNUP_FALLBACK_MESSAGE);
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
