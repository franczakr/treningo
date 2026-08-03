import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import type { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BlockedReason } from "@google/genai";
import type { Database } from "@/db/database.types";
import { upsertProfile } from "@/lib/services/profile";
import { createTestUser, type TestUser } from "@/lib/test-helpers/integration-users";

// Real-endpoint integration test for Risk #4 (a model-side failure must end in
// a clean, retryable error — never a 500 with internals, never a partial plan)
// and Risk #7 (no error path leaks internal detail). Before this file,
// src/pages/api/plan/generate.ts had no test at all; every failure-UX claim
// about it was verified by human eyeball only
// (context/archive/2026-06-28-gemini-plan-generation/plan.md:384-385).
//
// Two module boundaries are substituted, and only two — both because they read
// `astro:env/server`, a virtual module that does not resolve under plain-node
// Vitest (the same constraint documented in save.integration.test.ts):
//   - "@/lib/supabase"  → the real, already-authenticated integration client,
//                         so the profile load, RLS and the database are REAL.
//   - "@/lib/gemini"    → a scripted fake client, so each documented provider
//                         failure is reproducible with no network call, no
//                         quota, and no non-determinism.
// Everything else — the auth guard, the real getProfile, generatePlan's whole
// retry/validate orchestration, and the route's error translation — runs for
// real. Mocking the service layer instead would turn this into an
// implementation mirror (test-plan.md §6.4).
let currentClient: SupabaseClient<Database> | null = null;
let currentGemini: GoogleGenAI | null = null;

vi.mock("@/lib/supabase", () => ({
  createClient: () => currentClient,
}));

vi.mock("@/lib/gemini", () => ({
  createGemini: () => currentGemini,
}));

const { POST } = await import("./generate");

// The generic, user-facing guarantee. Asserted as an exact string because here
// the text IS the contract under test: it is what the user sees instead of the
// provider's own words.
const GENERIC_GENERATION_MESSAGE = "Nie udało się wygenerować planu. Spróbuj ponownie.";

// Planted in the fake provider failure. Must reach the server log and must
// never reach the response body.
const SENTINEL = "SENTINEL-PROVIDER-DETAIL-8f3a";

interface FakeGenerateContentResponse {
  text?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string }[];
}

// A fake Gemini client that either throws or returns scripted raw responses,
// substituted at the SDK-call boundary only (test-plan.md §6.1).
function fakeGemini(scripted: Error | FakeGenerateContentResponse[]): {
  client: GoogleGenAI;
  callCount: () => number;
} {
  let n = 0;
  const fake = {
    models: {
      generateContent: (_args: unknown): Promise<FakeGenerateContentResponse> => {
        n += 1;
        if (scripted instanceof Error) {
          return Promise.reject(scripted);
        }
        // Deliberately repeats the last scripted response once exhausted, so a
        // single fixture can drive all three retry attempts (the soft-failure
        // case below relies on that). Per-surface call counts are pinned in the
        // unit suite (plan-generator.test.ts), whose fake instead throws on an
        // unscripted call.
        const response = scripted[Math.min(n - 1, scripted.length - 1)];
        return Promise.resolve(response);
      },
    },
  };
  return { client: fake as unknown as GoogleGenAI, callCount: () => n };
}

function fakeContext(userId: string | null): APIContext {
  return {
    locals: userId === null ? {} : { user: { id: userId } },
    request: new Request("http://localhost/api/plan/generate", { method: "POST" }),
    cookies: {},
  } as unknown as APIContext;
}

// A profile is required for generation (the route 422s without one). One
// training day keeps the scripted plans minimal.
async function seedProfile(testUser: TestUser): Promise<void> {
  const { error } = await upsertProfile(testUser.client, testUser.userId, {
    goal: "strength",
    experience_level: "beginner",
    age: 30,
    weight_kg: 80,
    training_days_per_week: 1,
    equipment: ["barbell"],
    squat_kg: null,
    bench_kg: null,
    deadlift_kg: null,
    ohp_kg: null,
    plank_seconds: null,
  });
  if (error) throw new Error(`Failed to seed profile: ${error.message}`);
}

function sessionFixture(equipment: "barbell" | "kettlebell") {
  return {
    name: "Trening A",
    focus: "całe ciało",
    exercises: [
      { name: "Przysiad", equipment, sets: 3, reps: "8-10", suggested_weight: "orientacyjnie 60 kg", rest_seconds: 90 },
    ],
  };
}

describe("POST /api/plan/generate — failure surfaces (Risks #4, #7)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
    await seedProfile(user);
    currentClient = user.client;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset the shared mutable fakes so a future case that forgets to assign
    // one cannot silently inherit the previous case's client and pass for the
    // wrong reason.
    currentGemini = null;
    currentClient = user.client;
  });

  it("an SDK-level provider failure answers 500 generation_failed with a generic message, and the raw detail reaches only the server log", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gemini = fakeGemini(new Error(`Gemini API error 503: ${SENTINEL}`));
    currentGemini = gemini.client;

    const response = await POST(fakeContext(user.userId));
    const rawBody = await response.text();

    expect(response.status).toBe(500);
    const body = JSON.parse(rawBody) as { error: string; message: string };
    expect(body.error).toBe("generation_failed");
    expect(body.message).toBe(GENERIC_GENERATION_MESSAGE);

    // Both halves of Risk #7 — asserting only one would let either a leak or a
    // lost log pass unnoticed.
    expect(rawBody).not.toContain(SENTINEL);
    expect(rawBody).not.toContain("Gemini");
    expect(errorLog).toHaveBeenCalled();
    const logged = errorLog.mock.calls.map((args) => args.map((a) => String(a)).join(" ")).join("\n");
    expect(logged).toContain(SENTINEL);
    // A hard failure must not consume the retry budget: without this, a
    // regression that retried three times would replay the same stale
    // response, produce an identical 500 body, and stay green while tripling
    // provider cost per failure.
    expect(gemini.callCount()).toBe(1);
  });

  it("a blocked prompt answers the same 500 contract, and the block reason stays out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gemini = fakeGemini([{ promptFeedback: { blockReason: BlockedReason.SAFETY } }]);
    currentGemini = gemini.client;

    const response = await POST(fakeContext(user.userId));
    const rawBody = await response.text();

    expect(response.status).toBe(500);
    const blockedBody = JSON.parse(rawBody) as { error: string; message: string };
    expect(blockedBody.error).toBe("generation_failed");
    expect(blockedBody.message).toBe(GENERIC_GENERATION_MESSAGE);
    // PlanGenerationError.message carries the block reason for the log; the
    // response must not.
    expect(rawBody).not.toContain(BlockedReason.SAFETY);
    expect(gemini.callCount()).toBe(1);
  });

  it("unparseable model output answers the same 500 contract — distinct surfaces collapse into one user-facing answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gemini = fakeGemini([{ text: "Przepraszam, nie mogę wygenerować planu." }]);
    currentGemini = gemini.client;

    const response = await POST(fakeContext(user.userId));
    const rawBody = await response.text();

    expect(response.status).toBe(500);
    const unparseableBody = JSON.parse(rawBody) as { error: string; message: string };
    expect(unparseableBody.error).toBe("generation_failed");
    expect(unparseableBody.message).toBe(GENERIC_GENERATION_MESSAGE);
    expect(rawBody).not.toContain("mogę wygenerować planu.");
    expect(gemini.callCount()).toBe(1);
  });

  it("an unconfigured provider answers 503 not_configured, naming no configuration internals", async () => {
    // The real createGemini() returns null when GEMINI_API_KEY is unset
    // (src/lib/gemini.ts:9-11) — this reproduces that contract exactly.
    currentGemini = null;

    const response = await POST(fakeContext(user.userId));
    const rawBody = await response.text();

    expect(response.status).toBe(503);
    const body = JSON.parse(rawBody) as { error: string; message: string };
    expect(body.error).toBe("not_configured");
    expect(body.message).toBe("Generowanie planów nie jest skonfigurowane.");
    expect(rawBody).not.toContain("GEMINI_API_KEY");
    expect(rawBody).not.toContain("SUPABASE");
  });

  it("a user with no profile answers 422 profile_required (real database read, not a stub)", async () => {
    const profileless = await createTestUser();
    currentClient = profileless.client;
    currentGemini = fakeGemini([{ text: JSON.stringify({ sessions: [sessionFixture("barbell")] }) }]).client;

    try {
      const response = await POST(fakeContext(profileless.userId));

      expect(response.status).toBe(422);
      expect((await response.json()) as { error: string }).toMatchObject({ error: "profile_required" });
    } finally {
      currentClient = user.client;
    }
  });

  it("an unauthenticated request answers 401 without touching the provider", async () => {
    const gemini = fakeGemini([{ text: JSON.stringify({ sessions: [sessionFixture("barbell")] }) }]);
    currentGemini = gemini.client;

    const response = await POST(fakeContext(null));

    expect(response.status).toBe(401);
    // Exact shape, not a subset match: the route deliberately answers with an
    // error code and NO `message` here (unlike every other branch), and
    // `toMatchObject` would not notice one being added later.
    expect(await response.json()).toEqual({ error: "unauthorized" });
    // The auth guard must run before any provider work is done.
    expect(gemini.callCount()).toBe(0);
  });

  it("characterizes the accepted decision: a soft-failure plan still answers 200 with ok:false and a usable plan", async () => {
    // Per context/archive/2026-06-28-save-plan/plan.md ("Saving works even when
    // ok === false") this is deliberate, shipped behavior — the positive control
    // proving the cases above are not green merely because everything fails.
    // `kettlebell` is outside the seeded profile's equipment, so every attempt
    // violates the equipment guardrail and the retry budget is exhausted.
    const gemini = fakeGemini([{ text: JSON.stringify({ sessions: [sessionFixture("kettlebell")] }) }]);
    currentGemini = gemini.client;

    const response = await POST(fakeContext(user.userId));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      violations: { guardrail: string }[];
      plan: { sessions: unknown[] };
    };
    expect(body.ok).toBe(false);
    expect(body.violations.map((v) => v.guardrail)).toContain("equipment");
    expect(body.plan.sessions.length).toBeGreaterThan(0);
    expect(gemini.callCount()).toBe(3);
  });
});
