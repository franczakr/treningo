import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

// Risk #7, rename route. Added during the Phase 4 impl review, which found a
// leak the phase's own fix had missed: `form.get("name")` can be a File, and
// zod's type-failure default ("Invalid input: expected string, received File")
// was reaching `?error=`. Every message this route can surface must be authored
// Polish.
//
// Only `@/lib/supabase` is substituted (mandatory — it reads
// `astro:env/server`); `@/lib/services/plans` is faked as a spy on whether the
// write was reached, never as evidence about persisted data (the real write path
// is covered against the real database by plans.integration.test.ts). The
// validation branch returns before any query, so no database is involved and
// this belongs in the hermetic unit suite.
const renamePlan = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({}),
}));

vi.mock("@/lib/services/plans", () => ({
  renamePlan: (...args: unknown[]) => renamePlan(...args) as unknown,
}));

const { POST } = await import("./rename");

const ZOD_DEFAULT_VOCABULARY = /expected|received|Invalid input|Invalid UUID|Too big/i;

function fakeContext(fields: Record<string, string | File>): APIContext {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return {
    locals: { user: { id: "11111111-1111-1111-1111-111111111111" } },
    request: new Request("http://localhost/api/plan/rename", { method: "POST", body }),
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
  // Restore any console spy too, so a failed assertion mid-test cannot leave
  // console.error suppressed for the rest of the file (matches signin.test.ts).
  vi.restoreAllMocks();
  renamePlan.mockReset();
});

describe("POST /api/plan/rename — validator internals never reach the user (Risk #7)", () => {
  it("answers a malformed plan id with an authored Polish message", async () => {
    const response = await POST(fakeContext({ plan_id: "not-a-uuid", name: "Mój plan" }));
    const errorParam = errorParamOf(response);

    expect(errorParam).toBe("Nieprawidłowy identyfikator planu.");
    expect(errorParam).not.toMatch(ZOD_DEFAULT_VOCABULARY);
    expect(renamePlan).not.toHaveBeenCalled();
  });

  it("answers a non-string name (a posted File) with an authored Polish message", async () => {
    // The exact case the review found leaking.
    const response = await POST(fakeContext({ plan_id: crypto.randomUUID(), name: new File(["x"], "payload.txt") }));
    const errorParam = errorParamOf(response);

    expect(errorParam).toBe("Nieprawidłowa nazwa planu.");
    expect(errorParam).not.toMatch(ZOD_DEFAULT_VOCABULARY);
    expect(renamePlan).not.toHaveBeenCalled();
  });

  it("answers an over-long name with the existing authored length message", async () => {
    const response = await POST(fakeContext({ plan_id: crypto.randomUUID(), name: "a".repeat(101) }));

    expect(errorParamOf(response)).toBe("Nazwa jest za długa (maks. 100 znaków).");
  });

  it("control: a valid rename reaches the write path and redirects cleanly", async () => {
    renamePlan.mockResolvedValue({ error: null });

    const response = await POST(fakeContext({ plan_id: crypto.randomUUID(), name: "Plan siłowy" }));

    expect(renamePlan).toHaveBeenCalledTimes(1);
    const location = response.headers.get("location");
    expect(location).toBe("/dashboard");
  });

  it("keeps a database error's detail out of the redirect, logging it instead", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renamePlan.mockResolvedValue({ error: { code: "42501", message: "permission denied for table plans" } });

    const response = await POST(fakeContext({ plan_id: crypto.randomUUID(), name: "Plan siłowy" }));
    const errorParam = errorParamOf(response);

    expect(errorParam).toBe("Nie udało się zmienić nazwy planu. Spróbuj ponownie.");
    expect(errorParam).not.toContain("permission denied");
    const logged = errorLog.mock.calls.map((args) => args.map((a) => JSON.stringify(a)).join(" ")).join("\n");
    expect(logged).toContain("permission denied for table plans");
    errorLog.mockRestore();
  });
});
