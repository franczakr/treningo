// Plan generation service — the orchestration core (and core risk) of S-02.
//
// Flow: build prompt → call Gemini 2.5 Flash with a JSON-Schema-constrained
// output → validate → if violations remain and attempts are left, rebuild the
// prompt with the violations as corrective feedback and regenerate (max 2
// retries, 3 total attempts). Returns the best attempt (fewest violations, ties
// broken toward the latest) plus its violation list. Hard failures (API error,
// blocked prompt, empty/unparseable output) throw PlanGenerationError — never a
// silent bad result.

import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { planSchema } from "@/lib/schemas/plan";
import { buildPlanPrompt } from "@/lib/services/plan-prompt";
import { validatePlan } from "@/lib/services/plan-validator";
import type { PlanGenerationResult, TrainingProfile, Violation, WorkoutPlan } from "@/types";

const MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 2; // 3 total attempts

// JSON Schema for Gemini's structured output, derived once from the Zod schema.
// `responseJsonSchema` accepts a full JSON Schema, but not the top-level `$schema`
// key that `z.toJSONSchema` emits — strip it. The rest of the generated schema
// (inlined objects, enums, min/max, descriptions) is accepted as-is.
const PLAN_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(planSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

// Hard failure: no usable plan was produced (API error, blocked prompt, or output
// that could not be parsed into the schema). Distinct from a soft failure, where a
// structurally-valid plan still violates a guardrail — that is returned with
// `ok: false`, not thrown.
export class PlanGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

export async function generatePlan(client: GoogleGenAI, profile: TrainingProfile): Promise<PlanGenerationResult> {
  let best: { plan: WorkoutPlan; violations: Violation[] } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { system, user } = buildPlanPrompt(profile, best?.violations);

    let parsed: WorkoutPlan;
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: PLAN_JSON_SCHEMA,
        },
      });

      // A blocked prompt or empty output is a hard failure (no usable plan).
      if (response.promptFeedback?.blockReason) {
        throw new PlanGenerationError("Model zablokował żądanie wygenerowania planu.");
      }
      const text = response.text;
      if (!text) {
        throw new PlanGenerationError("Model nie zwrócił treści planu.");
      }

      const result = planSchema.safeParse(JSON.parse(text) as unknown);
      if (!result.success) {
        throw new PlanGenerationError("Nie udało się odczytać planu ze struktury odpowiedzi modelu.");
      }
      parsed = result.data;
    } catch (error) {
      if (error instanceof PlanGenerationError) throw error;
      throw new PlanGenerationError("Błąd podczas wywołania modelu generującego plan.", error);
    }

    const violations = validatePlan(parsed, profile);
    if (violations.length === 0) {
      return { plan: parsed, violations: [], ok: true };
    }

    // Track the best attempt so far. `<=` so a tie resolves toward the latest.
    if (best === null || violations.length <= best.violations.length) {
      best = { plan: parsed, violations };
    }
  }

  // Exhausted retries with a structurally-valid but still-violating plan: return
  // the best attempt as a soft failure for the UI to surface with a warning.
  // `best` is always set here — the loop runs at least once and any parsed plan
  // is recorded before this point (an unparseable one would have thrown).
  if (best === null) {
    throw new PlanGenerationError("Generacja planu nie dała żadnego wyniku.");
  }
  return { plan: best.plan, violations: best.violations, ok: false };
}
