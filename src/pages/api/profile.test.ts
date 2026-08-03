import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

// Risk #7, validation half. This route was the original leak site: it put
// `parsed.error.issues[0].message` into `/training-profile?error=`, which
// `training-profile.astro` renders through `ServerError` — so zod's English
// defaults (including "Invalid option: expected one of \"strength\"|…", which
// enumerates the database enum domain) were user-visible. The schema now
// carries authored Polish messages; this pins the route half of that contract.
//
// Two substitutions, both deliberate. `@/lib/supabase` is mandatory (it reads
// `astro:env/server`). `@/lib/services/profile` is faked as well — which
// test-plan.md §6.4 warns against for *endpoint* tests, because a faked service
// cannot prove database state. That warning does not apply here: the subject is
// the route's validation branch, which returns before any query runs, and the
// service fake is used as a spy on whether the write was reached at all — never
// as evidence about persisted data. The real write path is covered against the
// real database by `profile-persistence.integration.test.ts`. Consequently no
// database is touched here, so this belongs in the hermetic unit suite.
const upsertProfile = vi.fn();
const getProfile = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({}),
}));

vi.mock("@/lib/services/profile", () => ({
  upsertProfile: (...args: unknown[]) => upsertProfile(...args) as unknown,
  getProfile: (...args: unknown[]) => getProfile(...args) as unknown,
}));

const { POST } = await import("./profile");

const ZOD_DEFAULT_VOCABULARY = /expected|received|Invalid option|Invalid input|Too small|Too big/i;

const validFields: Record<string, string> = {
  goal: "strength",
  experience_level: "beginner",
  age: "30",
  weight_kg: "80",
  training_days_per_week: "3",
  equipment: "barbell",
};

function fakeContext(overrides: Record<string, string> = {}): APIContext {
  const body = new FormData();
  for (const [key, value] of Object.entries({ ...validFields, ...overrides })) {
    body.set(key, value);
  }
  return {
    locals: { user: { id: "11111111-1111-1111-1111-111111111111" } },
    request: new Request("http://localhost/api/profile", { method: "POST", body }),
    cookies: {},
    redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  } as unknown as APIContext;
}

function locationOf(response: Response): URL {
  const location = response.headers.get("location");
  if (location === null) throw new Error("Expected a redirect with a Location header");
  return new URL(location, "http://localhost");
}

afterEach(() => {
  vi.restoreAllMocks();
  upsertProfile.mockReset();
  getProfile.mockReset();
});

describe("POST /api/profile — validator internals never reach the user (Risk #7)", () => {
  it("answers an out-of-range value with an authored Polish message, logging the issues", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(fakeContext({ age: "5" }));
    const errorParam = locationOf(response).searchParams.get("error");

    expect(errorParam).not.toBeNull();
    expect(errorParam).not.toMatch(ZOD_DEFAULT_VOCABULARY);
    expect(errorParam).toContain("Minimalny wiek");
    // Nothing was written, and the detail went to the log instead of the URL.
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("answers an unknown enum value without echoing the enum domain", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(fakeContext({ goal: "become_a_wizard" }));
    const errorParam = locationOf(response).searchParams.get("error");

    // Positive assertion first: a negative-only case would also pass on an
    // empty or missing message.
    expect(errorParam).toBe("Wybierz jedną z dostępnych opcji.");
    expect(errorParam).not.toMatch(ZOD_DEFAULT_VOCABULARY);
    // The leak that mattered: the list of valid database enum values.
    expect(errorParam).not.toContain("muscle_gain");
    expect(errorParam).not.toContain("general_fitness");
  });

  it("control: a valid payload reaches the write path", async () => {
    getProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue({ error: null });

    const response = await POST(fakeContext());

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    // First-ever save carries the user into plan generation (PRD §Business Logic).
    expect(locationOf(response).pathname).toBe("/plan");
  });
});
