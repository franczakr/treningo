import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { AUTH_NOT_CONFIGURED_MESSAGE, SIGNIN_FALLBACK_MESSAGE } from "@/lib/auth-errors";

// Risk #7 at the route boundary: a failure from the auth provider must reach
// the user as an authored Polish message, with the provider's own words going
// only to the server log. Before the fix this route interpolated
// `error.message` straight into `?error=`, which `auth/signin.astro` renders
// raw — so infrastructure text ("Database error querying schema") was
// user-visible.
//
// No database is involved on this path, so this belongs in the hermetic unit
// suite rather than the Docker integration one. The single substituted boundary
// is `@/lib/supabase`, which is mandatory: it reads `astro:env/server`, a
// virtual module that does not resolve under plain-node Vitest. The route's own
// translation and redirect construction run for real.
interface FakeAuthResult {
  error: { code?: string; message: string } | null;
}

let signInResult: FakeAuthResult = { error: null };
let clientIsConfigured = true;
const signInWithPassword = vi.fn((_credentials: unknown): Promise<FakeAuthResult> => Promise.resolve(signInResult));

vi.mock("@/lib/supabase", () => ({
  createClient: () => (clientIsConfigured ? { auth: { signInWithPassword } } : null),
}));

const { POST } = await import("./signin");

const INFRA_MESSAGE = "Database error querying schema";

// The route returns `context.redirect(...)`, so the fake returns a real
// redirect Response and assertions read its Location header — the actual
// returned value, not a spy's arguments.
function fakeContext(email = "user@example.com", password = "hunter2"): APIContext {
  const body = new FormData();
  body.set("email", email);
  body.set("password", password);
  return {
    request: new Request("http://localhost/api/auth/signin", { method: "POST", body }),
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
  signInResult = { error: null };
  clientIsConfigured = true;
  signInWithPassword.mockClear();
});

describe("POST /api/auth/signin — provider detail never reaches the user (Risk #7)", () => {
  it("answers an infrastructure failure with the generic Polish message, logging the raw error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signInResult = { error: { code: "unexpected_failure", message: INFRA_MESSAGE } };

    const response = await POST(fakeContext());
    const errorParam = errorParamOf(response);

    expect(errorParam).toBe(SIGNIN_FALLBACK_MESSAGE);
    expect(errorParam).not.toContain("Database");
    expect(errorParam).not.toContain("schema");

    // The other half: diagnosability must not be lost in the process.
    const logged = errorLog.mock.calls.map((args) => args.map((a) => JSON.stringify(a)).join(" ")).join("\n");
    expect(logged).toContain(INFRA_MESSAGE);
  });

  it("still gives actionable feedback for a wrong password — the control against blanket-genericizing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    signInResult = { error: { code: "invalid_credentials", message: "Invalid login credentials" } };

    const response = await POST(fakeContext());

    expect(errorParamOf(response)).toBe("Nieprawidłowy e-mail lub hasło.");
  });

  it("answers a Polish message when auth is not configured, without calling the provider", async () => {
    clientIsConfigured = false;

    const response = await POST(fakeContext());

    expect(errorParamOf(response)).toBe(AUTH_NOT_CONFIGURED_MESSAGE);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("redirects to the dashboard on success", async () => {
    signInResult = { error: null };

    const response = await POST(fakeContext());

    expect(response.headers.get("location")).toBe("/dashboard");
  });
});
