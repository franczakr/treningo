// Plan generation service — the orchestration core (and core risk) of S-02.
//
// Flow: build prompt → call Opus 4.8 with a Zod-constrained output schema →
// validate → if violations remain and attempts are left, rebuild the prompt with
// the violations as corrective feedback and regenerate (max 2 retries, 3 total
// attempts). Returns the best attempt (fewest violations, ties broken toward the
// latest) plus its violation list. Hard failures (API error, refusal,
// unparseable output) throw PlanGenerationError — never a silent bad result.

import type { Anthropic } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { planSchema } from "@/lib/schemas/plan";
import { buildPlanPrompt } from "@/lib/services/plan-prompt";
import { validatePlan } from "@/lib/services/plan-validator";
import type { PlanGenerationResult, TrainingProfile, Violation, WorkoutPlan } from "@/types";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16000;
const MAX_RETRIES = 2; // 3 total attempts

// Hard failure: no usable plan was produced (API error, refusal, or output that
// could not be parsed into the schema). Distinct from a soft failure, where a
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

export async function generatePlan(client: Anthropic, profile: TrainingProfile): Promise<PlanGenerationResult> {
  let best: { plan: WorkoutPlan; violations: Violation[] } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { system, user } = buildPlanPrompt(profile, best?.violations);

    let parsed: WorkoutPlan | null;
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system,
        output_config: {
          effort: "medium",
          format: zodOutputFormat(planSchema),
        },
        messages: [{ role: "user", content: user }],
      });

      // A refusal is HTTP 200 with no usable content — treat as a hard failure.
      if (response.stop_reason === "refusal") {
        throw new PlanGenerationError("Model odmówił wygenerowania planu.");
      }

      parsed = response.parsed_output;
    } catch (error) {
      if (error instanceof PlanGenerationError) throw error;
      throw new PlanGenerationError("Błąd podczas wywołania modelu generującego plan.", error);
    }

    if (!parsed) {
      throw new PlanGenerationError("Nie udało się odczytać planu ze struktury odpowiedzi modelu.");
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
