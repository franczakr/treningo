import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_MESSAGES,
  AUTH_MAPPED_CODES,
  authErrorMessage,
  SIGNIN_FALLBACK_MESSAGE,
  SIGNUP_FALLBACK_MESSAGE,
} from "@/lib/auth-errors";

// Risk #7. The oracle here is the product requirement — "the user is told what
// they can act on, and never what the auth service said" — plus the security
// property of the module, never the function's own output.

// Realistic infrastructure text GoTrue can put in `message`. None of it may
// ever reach a user.
const INFRA_MESSAGE = "Database error querying schema";

// Mirrors the shape of a real `AuthError` (which carries BOTH fields) rather
// than the narrow parameter type — the point of these cases is that a `message`
// is present and still cannot escape.
interface ProviderAuthError {
  code?: string;
  message: string;
}

function providerError(code: string | undefined, message = INFRA_MESSAGE): ProviderAuthError {
  return code === undefined ? { message } : { code, message };
}

describe("authErrorMessage — mapped codes", () => {
  // One row per code the product deliberately gives specific feedback for. A
  // silent remapping (or a dropped mapping) fails here rather than degrading
  // the sign-in experience unnoticed.
  const cases: [code: string, expected: string][] = [
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
    // Added after the Phase 4 impl review: leaving these to the generic
    // fallback was a real UX regression — a user rejected for a bad address
    // would retry the same address forever with no idea what was wrong.
    ["email_address_invalid", "Podaj poprawny adres e-mail."],
    ["email_address_not_authorized", "Ten adres e-mail nie jest dopuszczony do rejestracji."],
    ["captcha_failed", "Weryfikacja zabezpieczenia nie powiodła się. Spróbuj ponownie."],
    ["request_timeout", "Przekroczono czas oczekiwania. Spróbuj ponownie."],
  ];

  it.each(cases)("maps %s to its authored Polish message", (code, expected) => {
    expect(authErrorMessage({ code }, SIGNIN_FALLBACK_MESSAGE)).toBe(expected);
  });

  it("ignores the provider message entirely, even for a mapped code", () => {
    // The whole point of mapping on `code`: whatever `message` holds is
    // irrelevant to the output.
    const result = authErrorMessage(providerError("invalid_credentials"), SIGNIN_FALLBACK_MESSAGE);

    expect(result).toBe("Nieprawidłowy e-mail lub hasło.");
    expect(result).not.toContain(INFRA_MESSAGE);
  });
});

describe("authErrorMessage — nothing internal can pass through (Risk #7)", () => {
  it("falls back for an unmapped code, leaking none of the provider text", () => {
    const result = authErrorMessage(providerError("unexpected_failure"), SIGNIN_FALLBACK_MESSAGE);

    expect(result).toBe(SIGNIN_FALLBACK_MESSAGE);
    expect(result).not.toContain("Database");
    expect(result).not.toContain("schema");
  });

  it("falls back when the code is absent — the documented pre-response case", () => {
    // `@supabase/auth-js` documents `code` as undefined for failures that occur
    // before an HTTP response is received.
    expect(authErrorMessage(providerError(undefined), SIGNUP_FALLBACK_MESSAGE)).toBe(SIGNUP_FALLBACK_MESSAGE);
  });

  it("falls back for a code that does not exist in the provider's union at all", () => {
    expect(authErrorMessage({ code: "totally_made_up_code" }, SIGNUP_FALLBACK_MESSAGE)).toBe(SIGNUP_FALLBACK_MESSAGE);
  });

  it("returns only authored strings, for any code and any message content", () => {
    // Sweep: a future edit that reintroduced a `message` pass-through would
    // produce a value outside the authored set and fail here.
    const codes = [
      "invalid_credentials",
      "email_not_confirmed",
      "unexpected_failure",
      "hook_timeout",
      "bad_json",
      "",
      "over_sms_send_rate_limit",
    ];
    const allowed = new Set([...AUTH_ERROR_MESSAGES, SIGNIN_FALLBACK_MESSAGE]);

    for (const code of codes) {
      const result = authErrorMessage(providerError(code, `${INFRA_MESSAGE} (${code})`), SIGNIN_FALLBACK_MESSAGE);
      expect(allowed.has(result)).toBe(true);
      expect(result).not.toContain(INFRA_MESSAGE);
    }
  });
});

// Same pattern as the migration-text guard in test-plan.md §6.2 and the
// `@google/genai` shape guard: the EXTERNAL artifact is the oracle. Every code
// this module maps must exist in the provider's own `ErrorCode` union, or the
// mapping is dead and the suite above would still be green — the map and the
// expectations would simply agree with each other.
//
// KNOW THE LIMIT: this proves a code is spelled the way the SDK spells it, not
// that GoTrue actually emits it for the scenario we assume, nor that the union
// is exhaustive of what the server can send.
describe("mapped codes exist in @supabase/auth-js's ErrorCode union", () => {
  const errorCodesPath = fileURLToPath(
    new URL("../../node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts", import.meta.url),
  );
  const errorCodesSource = readFileSync(errorCodesPath, "utf-8");

  it.each(AUTH_MAPPED_CODES)("%s is a real provider error code", (code) => {
    expect(errorCodesSource).toContain(`'${code}'`);
  });
});
