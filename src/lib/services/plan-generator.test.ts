import {
  BlockedReason,
  FinishReason,
  GenerateContentResponse,
  GenerateContentResponsePromptFeedback,
  type GoogleGenAI,
} from "@google/genai";
import { describe, expect, it } from "vitest";
import { generatePlan, PlanGenerationError } from "@/lib/services/plan-generator";
import type { PlanExercise, PlanSession, TrainingProfile, WorkoutPlan } from "@/types";

// Literal profile fixture, same conventions as plan-validator.test.ts.
const profile: TrainingProfile = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-06-27T00:00:00.000Z",
  updated_at: "2026-06-27T00:00:00.000Z",
  goal: "strength",
  experience_level: "beginner",
  age: 30,
  weight_kg: 80,
  training_days_per_week: 3,
  equipment: ["bodyweight_only"],
  squat_kg: null,
  bench_kg: null,
  deadlift_kg: null,
  ohp_kg: null,
  plank_seconds: null,
};

function exercise(overrides: Partial<PlanExercise> = {}): PlanExercise {
  return {
    name: "Pompki",
    equipment: "bodyweight_only",
    sets: 3,
    reps: "8-10",
    suggested_weight: "masa ciała",
    rest_seconds: 90,
    ...overrides,
  };
}

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return {
    name: "Trening",
    focus: "całe ciało",
    exercises: [exercise()],
    ...overrides,
  };
}

const soundPlan: WorkoutPlan = {
  sessions: [session({ name: "A" }), session({ name: "B" }), session({ name: "C" })],
};

// Minimal shape plan-generator.ts actually reads off a generateContent
// response — not the full @google/genai response type, which has private
// internals a plain object can never structurally satisfy.
interface FakeGenerateContentResponse {
  text?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string }[];
}

function fakeClientReturning(...responses: WorkoutPlan[]): GoogleGenAI {
  let call = 0;
  const fake = {
    models: {
      generateContent: (_args: unknown): Promise<FakeGenerateContentResponse> => {
        const plan = responses[call];
        call += 1;
        return Promise.resolve({ text: JSON.stringify(plan) });
      },
    },
  };
  return fake as unknown as GoogleGenAI;
}

describe("generatePlan", () => {
  it("resolves ok:true after a single call when the first attempt is sound", async () => {
    let calls = 0;
    const client = {
      models: {
        generateContent: (_args: unknown): Promise<FakeGenerateContentResponse> => {
          calls += 1;
          return Promise.resolve({ text: JSON.stringify(soundPlan) });
        },
      },
    } as unknown as GoogleGenAI;

    const result = await generatePlan(client, profile);

    expect(result).toEqual({ plan: soundPlan, violations: [], ok: true });
    expect(calls).toBe(1);
  });

  it("retries up to 3 total attempts and resolves the best (tie-broken toward latest) attempt when every attempt violates a guardrail", async () => {
    // Attempt 1: one exercise tagged with equipment outside the profile's set
    // — 1 violation ("equipment").
    const attempt1: WorkoutPlan = {
      sessions: [
        session({ name: "Attempt1-A", exercises: [exercise({ equipment: "barbell" })] }),
        session({ name: "Attempt1-B" }),
        session({ name: "Attempt1-C" }),
      ],
    };
    // Attempt 2: wrong session count AND an equipment violation — 2
    // violations, strictly worse than attempt 1.
    const attempt2: WorkoutPlan = {
      sessions: [
        session({ name: "Attempt2-A", exercises: [exercise({ equipment: "barbell" })] }),
        session({ name: "Attempt2-B" }),
      ],
    };
    // Attempt 3: same violation count as attempt 1 (1 equipment violation, 3
    // sessions) — ties with the current best, so the documented tie-break
    // ("<=", resolves toward the latest attempt) must pick this one.
    const attempt3: WorkoutPlan = {
      sessions: [
        session({ name: "Attempt3-A", exercises: [exercise({ equipment: "kettlebell" })] }),
        session({ name: "Attempt3-B" }),
        session({ name: "Attempt3-C" }),
      ],
    };

    let calls = 0;
    const responses = [attempt1, attempt2, attempt3];
    const client = {
      models: {
        generateContent: (_args: unknown): Promise<FakeGenerateContentResponse> => {
          const plan = responses[calls];
          calls += 1;
          return Promise.resolve({ text: JSON.stringify(plan) });
        },
      },
    } as unknown as GoogleGenAI;

    const result = await generatePlan(client, profile);

    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    // The best-attempt tie-break resolves toward the latest — attempt 3, not
    // attempt 1, despite both carrying exactly one violation.
    expect(result.plan).toEqual(attempt3);
  });

  it("never resolves ok:true when every scripted attempt violates a guardrail (ok === violations.length === 0 invariant)", async () => {
    const violatingEveryTime: WorkoutPlan = {
      sessions: [session({ exercises: [exercise({ equipment: "barbell" })] }), session({ name: "B" })],
    };
    const client = fakeClientReturning(violatingEveryTime, violatingEveryTime, violatingEveryTime);

    const result = await generatePlan(client, profile);

    expect(result.ok).toBe(false);
    expect(result.ok).toBe(result.violations.length === 0);
  });

  it("characterizes the accepted decision: an exhausted-retries soft failure resolves with a usable plan, not a thrown error", async () => {
    // Per context/archive/2026-06-28-save-plan/plan.md: "Saving works even
    // when ok === false (a soft-failure plan)." This is deliberate,
    // shipped behavior — this test locks it in as a behavior, not a defect,
    // so a future change that starts throwing instead of returning here is
    // caught as a change, not silently "fixed".
    const violatingEveryTime: WorkoutPlan = {
      sessions: [session({ exercises: [exercise({ equipment: "barbell" })] }), session({ name: "B" })],
    };
    const client = fakeClientReturning(violatingEveryTime, violatingEveryTime, violatingEveryTime);

    const result = await generatePlan(client, profile);

    expect(result.ok).toBe(false);
    expect(Array.isArray(result.plan.sessions)).toBe(true);
    expect(result.plan.sessions.length).toBeGreaterThan(0);
  });
});

// ── Hard-failure surfaces (Risk #4) ──────────────────────────────────────────
//
// The oracle for this block is the design contract written BEFORE the code, in
// context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108 — not the
// current implementation:
//
//   "treat as PlanGenerationError (no silent bad result) when the SDK call
//    throws, when response.promptFeedback?.blockReason is set, when the
//    candidate finishReason indicates a safety/blocked stop, or when
//    response.text is empty/undefined or not parseable into planSchema. Only
//    guardrail violations on an otherwise-parsed plan go through the retry
//    loop."
//
// Every case therefore asserts two things: the failure ends in the defined
// error type (never a partial plan, never a silent result), and the retry
// budget is NOT consumed — a hard failure aborts on the first attempt, which is
// what separates it from the soft/guardrail path that legitimately calls three
// times.

// A scripted response, or an Error the fake should reject with (surface S1).
type ScriptedCall = FakeGenerateContentResponse | Error;

function scriptedClient(...calls: ScriptedCall[]): { client: GoogleGenAI; callCount: () => number } {
  let n = 0;
  const fake = {
    models: {
      generateContent: (_args: unknown): Promise<FakeGenerateContentResponse> => {
        if (n >= calls.length) {
          // An unscripted call means the retry budget was consumed differently
          // than the case expected — fail loudly instead of silently degrading
          // into an empty-response hard failure.
          throw new Error(`Fake client called ${n + 1} time(s) but only ${calls.length} response(s) were scripted.`);
        }
        const scripted = calls[n];
        n += 1;
        if (scripted instanceof Error) {
          return Promise.reject(scripted);
        }
        return Promise.resolve(scripted);
      },
    },
  };
  return { client: fake as unknown as GoogleGenAI, callCount: () => n };
}

// Asserts the call rejects with PlanGenerationError and hands the error back
// for per-surface assertions. Fails loudly on a resolved value — a hard failure
// that resolves would be exactly the "partial plan the user believes is real"
// scenario Risk #4 is about.
async function expectHardFailure(client: GoogleGenAI): Promise<PlanGenerationError> {
  try {
    const resolved = await generatePlan(client, profile);
    throw new Error(`Expected a hard failure, but generatePlan resolved with: ${JSON.stringify(resolved)}`);
  } catch (error) {
    if (error instanceof PlanGenerationError) {
      return error;
    }
    throw error;
  }
}

describe("generatePlan — hard-failure surfaces (Risk #4)", () => {
  it("S1: an SDK-level throw becomes PlanGenerationError with the raw error kept on .cause, without consuming a retry", async () => {
    const sdkError = new Error("Gemini API error 503: SENTINEL-PROVIDER-DETAIL");
    const { client, callCount } = scriptedClient(sdkError);

    const error = await expectHardFailure(client);

    // The raw provider error must survive for the server-side log
    // (api/plan/generate.ts logs `error.cause ?? error`) …
    expect(error.cause).toBe(sdkError);
    // … but must not be concatenated into the error message itself.
    expect(error.message).not.toContain("SENTINEL-PROVIDER-DETAIL");
    expect(callCount()).toBe(1);
  });

  it("S2: a blocked prompt becomes PlanGenerationError naming the block reason, without consuming a retry", async () => {
    const { client, callCount } = scriptedClient({ promptFeedback: { blockReason: BlockedReason.SAFETY } });

    const error = await expectHardFailure(client);

    // The block reason belongs in the (server-side-logged) message — this is
    // the diagnostic guarantee from gemini-plan-generation impl-review F1.
    expect(error.message).toContain(BlockedReason.SAFETY);
    expect(error.cause).toBeUndefined();
    expect(callCount()).toBe(1);
  });

  it("S3: a stop reason firing WITHOUT a block reason still becomes PlanGenerationError, naming the finish reason", async () => {
    // Characterization of shipped design, not a defect: impl-review F1 was
    // fixed diagnostically only ("UX unchanged"), so a MAX_TOKENS stop has no
    // branch of its own — it deliberately arrives through the empty-text guard
    // (src/lib/services/plan-generator.ts:78-84). This test pins that route so
    // a future refactor cannot quietly drop the reason from the log.
    const { client, callCount } = scriptedClient({ candidates: [{ finishReason: FinishReason.MAX_TOKENS }] });

    const error = await expectHardFailure(client);

    expect(error.message).toContain(FinishReason.MAX_TOKENS);
    expect(callCount()).toBe(1);
  });

  it("S4: empty output with no reason at all becomes PlanGenerationError, and the message omits the optional reason", async () => {
    const { client, callCount } = scriptedClient({});

    const error = await expectHardFailure(client);

    // The finishReason interpolation is conditional — with nothing to report,
    // the message must not advertise an empty one.
    expect(error.message).not.toContain("finishReason");
    expect(callCount()).toBe(1);
  });

  it("S5a: output that is not JSON becomes PlanGenerationError with the parse error on .cause", async () => {
    const { client, callCount } = scriptedClient({ text: "Przepraszam, nie mogę wygenerować takiego planu." });

    const error = await expectHardFailure(client);

    // Note: this surface is wrapped by the generic call-failure branch, so its
    // message says "call" rather than "parse" — shipped behavior, log-only,
    // characterized rather than failed. `.cause` is what makes it diagnosable.
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(callCount()).toBe(1);
  });

  it("S5b: truncated output (the maxOutputTokens/thinking-token route) becomes PlanGenerationError with the parse error on .cause", async () => {
    // Reproduces impl-review F3's truncation consequence without needing a
    // real token cap: a cut-off JSON document.
    const { client, callCount } = scriptedClient({ text: JSON.stringify(soundPlan).slice(0, 40) });

    const error = await expectHardFailure(client);

    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(callCount()).toBe(1);
  });

  it("S5c: valid JSON that does not match planSchema becomes PlanGenerationError, distinctly from a call failure", async () => {
    const { client, callCount } = scriptedClient({ text: JSON.stringify({ sessions: [{ name: "A" }] }) });

    const error = await expectHardFailure(client);

    // Two things distinguish the schema branch in a server log: it carries no
    // `.cause` (unlike the wrapped parse/call failures) AND it names the
    // response structure rather than the call. Asserting only the absent
    // `.cause` would not discriminate it from S2/S3/S4, which also have none.
    expect(error.message).toContain("struktury odpowiedzi modelu");
    expect(error.cause).toBeUndefined();
    expect(callCount()).toBe(1);
  });

  it("discriminates hard from soft: the same fixture count that throws on a hard failure retries three times and resolves on a soft one", async () => {
    // Control for the whole block: without it, a change that made every
    // outcome throw would leave every case above green.
    const violating: WorkoutPlan = {
      sessions: [session({ exercises: [exercise({ equipment: "barbell" })] })],
    };
    const soft = scriptedClient(
      { text: JSON.stringify(violating) },
      { text: JSON.stringify(violating) },
      {
        text: JSON.stringify(violating),
      },
    );

    const result = await generatePlan(soft.client, profile);

    expect(result.ok).toBe(false);
    expect(soft.callCount()).toBe(3);

    const hard = scriptedClient({}, { text: JSON.stringify(soundPlan) });
    await expectHardFailure(hard.client);
    expect(hard.callCount()).toBe(1);
  });
});

// ── Provider response-shape guard ────────────────────────────────────────────
//
// Discharges the obligation rollout Phase 1 explicitly handed to Phase 4
// (context/archive/2026-08-02-testing-plan-soundness/plan.md:592-597): the fake
// above returns `{ text: … }` / `{ promptFeedback: … }` / `{ candidates: … }`,
// so "if the real @google/genai response shape changes, these tests would keep
// passing while production breaks."
//
// Same shape as the migration-text guard in test-plan.md §6.2: the external
// artifact — here the installed SDK — is the oracle, never our own fake.
//
// KNOW THE LIMIT: this detects a renamed or removed field/enum member. It
// cannot detect a semantic change in WHEN the SDK populates a field, and it
// says nothing about what the live API returns. A field that keeps its name and
// changes its meaning passes this guard forever.
describe("@google/genai response-shape guard", () => {
  it("still exposes the `text` accessor the generator reads off a response", () => {
    expect(Object.getOwnPropertyDescriptor(GenerateContentResponse.prototype, "text")).toBeDefined();
  });

  it("still ships the promptFeedback type the blocked-prompt branch reads", () => {
    expect(typeof GenerateContentResponsePromptFeedback).toBe("function");
  });

  it("still exports the finish/block reason members these fixtures depend on", () => {
    expect(FinishReason.MAX_TOKENS).toBe("MAX_TOKENS");
    expect(BlockedReason.SAFETY).toBe("SAFETY");
  });
});
