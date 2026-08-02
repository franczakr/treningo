import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/services/plan-generator";
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
