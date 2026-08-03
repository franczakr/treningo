// Translation of Supabase auth failures into user-facing Polish messages.
//
// SECURITY PROPERTY (the reason this module exists): it reads ONLY `error.code`
// — never `error.message`. GoTrue's message field carries whatever the auth
// service felt like saying, and infrastructure text ("Database error querying
// schema", "Error sending confirmation email", hook and rate-limit internals)
// shares that field with benign text like "Invalid login credentials". Echoing
// it to the user was a live information leak (test-plan.md Risk #7); mapping a
// bounded set of codes instead makes a pass-through impossible by construction,
// while keeping the feedback users actually need (wrong password, unconfirmed
// e-mail).
//
// Codes come from `@supabase/auth-js`'s `ErrorCode` union. An unrecognized or
// absent code (the SDK documents `code` as undefined for failures that happen
// before a response is received) falls back to the caller's generic message.

export const SIGNIN_FALLBACK_MESSAGE = "Nie udało się zalogować. Spróbuj ponownie.";
export const SIGNUP_FALLBACK_MESSAGE = "Nie udało się utworzyć konta. Spróbuj ponownie.";
export const AUTH_NOT_CONFIGURED_MESSAGE = "Uwierzytelnianie nie jest skonfigurowane.";

// A Map (not a plain object) so a miss is `undefined` at the type level too.
const MESSAGES_BY_CODE = new Map<string, string>([
  ["invalid_credentials", "Nieprawidłowy e-mail lub hasło."],
  ["email_not_confirmed", "Potwierdź adres e-mail — kliknij link w wiadomości, którą wysłaliśmy."],
  ["user_already_exists", "Konto z tym adresem e-mail już istnieje."],
  ["email_exists", "Konto z tym adresem e-mail już istnieje."],
  ["weak_password", "Hasło jest za słabe — wybierz dłuższe i trudniejsze."],
  ["validation_failed", "Podaj poprawny adres e-mail i hasło."],
  ["over_request_rate_limit", "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie."],
  ["over_email_send_rate_limit", "Zbyt wiele wiadomości e-mail. Odczekaj chwilę i spróbuj ponownie."],
  ["signup_disabled", "Rejestracja jest tymczasowo wyłączona."],
  ["user_banned", "To konto zostało zablokowane."],
]);

// Every string this can return, for tests that assert no other value can escape.
export const AUTH_ERROR_MESSAGES: readonly string[] = [...MESSAGES_BY_CODE.values()];

export function authErrorMessage(error: { code?: string }, fallback: string): string {
  const code = error.code;
  if (code === undefined) {
    return fallback;
  }
  return MESSAGES_BY_CODE.get(code) ?? fallback;
}
