import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { AUTH_NOT_CONFIGURED_MESSAGE, SIGNUP_FALLBACK_MESSAGE } from "@/lib/auth-errors";

// Risk #7, signup half. This is not a copy for coverage's sake: signin.ts and
// signup.ts are byte-identical in shape, so a fix (or a future regression)
// applied to only one of them is a realistic failure mode. See
// signin.test.ts for the full rationale of the single mocked boundary.
interface FakeAuthResult {
  error: { code?: string; message: string } | null;
}

let signUpResult: FakeAuthResult = { error: null };
let clientIsConfigured = true;
const signUp = vi.fn((_credentials: unknown): Promise<FakeAuthResult> => Promise.resolve(signUpResult));

vi.mock("@/lib/supabase", () => ({
  createClient: () => (clientIsConfigured ? { auth: { signUp } } : null),
}));

const { POST } = await import("./signup");

// Realistic GoTrue infrastructure text for the signup path specifically.
const INFRA_MESSAGE = "Error sending confirmation email";

function fakeContext(email = "new-user@example.com", password = "hunter2"): APIContext {
  const body = new FormData();
  body.set("email", email);
  body.set("password", password);
  return {
    request: new Request("http://localhost/api/auth/signup", { method: "POST", body }),
    cookies: {},
    redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  } as unknown as APIContext;
}

function errorParamOf(response: Response): string | null {
  const location = response.headers.get("location");
  if (location === null) throw new Error("Expected a redirect with a Location header");
  return new URL(location, "http://localhost").searchParams.get("error");
}

afterEach(() => {
  vi.restoreAllMocks();
  signUpResult = { error: null };
  clientIsConfigured = true;
  signUp.mockClear();
});

describe("POST /api/auth/signup — provider detail never reaches the user (Risk #7)", () => {
  it("answers a mail-infrastructure failure with the generic Polish message, logging the raw error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signUpResult = { error: { code: "unexpected_failure", message: INFRA_MESSAGE } };

    const response = await POST(fakeContext());
    const errorParam = errorParamOf(response);

    expect(errorParam).toBe(SIGNUP_FALLBACK_MESSAGE);
    expect(errorParam).not.toContain("confirmation email");

    const logged = errorLog.mock.calls.map((args) => args.map((a) => JSON.stringify(a)).join(" ")).join("\n");
    expect(logged).toContain(INFRA_MESSAGE);
  });

  it("still tells the user an account already exists — the control against blanket-genericizing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    signUpResult = { error: { code: "user_already_exists", message: "User already registered" } };

    const response = await POST(fakeContext());

    expect(errorParamOf(response)).toBe("Konto z tym adresem e-mail już istnieje.");
  });

  it("answers a Polish message when auth is not configured, without calling the provider", async () => {
    clientIsConfigured = false;

    const response = await POST(fakeContext());

    expect(errorParamOf(response)).toBe(AUTH_NOT_CONFIGURED_MESSAGE);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("redirects to the confirm-email page on success", async () => {
    signUpResult = { error: null };

    const response = await POST(fakeContext());

    expect(response.headers.get("location")).toBe("/auth/confirm-email");
  });
});
