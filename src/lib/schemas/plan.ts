// Generated-plan output schema — the shape the LLM must return (the Gemini
// structured-output schema is derived from this via `z.toJSONSchema`) and the
// source of the shared plan types in `@/types`. Field `.describe()` text doubles
// as generation guidance.
//
// NOTE: the numeric `min`/`max` bounds below are sent to Gemini as part of the
// `responseJsonSchema` (generation guidance) and re-checked when we parse the
// response with this Zod schema. They are NOT the soundness guardrails — the real
// enforcement (equipment ⊆ available, session count = chosen days, goal
// consistency) lives in the plan validator, NOT here.

import { z } from "zod";
import { Constants } from "@/db/database.types";

// Sane bounds (client-side parse only; see note above).
const SETS_MIN = 1;
const SETS_MAX = 20;
const REST_MIN = 0;
const REST_MAX = 1200; // seconds

// Hard, save-blocking caps against an arbitrarily large plan (Risk #6 — see
// context/changes/testing-persistence-boundaries/research.md). This is the
// ONLY enforcement point for plan size: the save endpoint never calls
// plan-validator.ts, and the database has no array-length CHECK either.
// EXERCISES_MAX matches plan-validator.ts's MAX_EXERCISES_PER_SESSION so the
// schema-layer cap and the soundness-layer structural-sanity check agree.
export const EXERCISES_MAX = 15;
// SESSIONS_MAX is double profile.ts's training_days_per_week max of 7 — no
// legitimate plan can approach it (session count must equal the profile's
// training_days_per_week), so this only bounds abuse.
export const SESSIONS_MAX = 14;

// Postgres jsonb cannot store the NUL code point; reject it here so a
// structurally-valid plan can never fail at the database insert (Risk #5
// Defect B — see context/changes/testing-plan-soundness/research.md).
const boundedText = (description: string) =>
  z
    .string()
    .refine((v) => !v.includes("\u0000"), "Tekst nie może zawierać znaku NUL.")
    .describe(description);

export const planExerciseSchema = z.object({
  name: boundedText("Nazwa ćwiczenia po polsku."),
  equipment: z
    .enum(Constants.public.Enums.equipment_item)
    .describe("Sprzęt wymagany do ćwiczenia — musi należeć do sprzętu dostępnego użytkownikowi."),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX).describe("Liczba serii roboczych."),
  reps: boundedText('Zakres lub liczba powtórzeń, np. "8–10" lub "do upadku".'),
  suggested_weight: boundedText('Orientacyjny ciężar, np. "orientacyjnie 40 kg", "masa ciała", "70% 1RM".'),
  rest_seconds: z.number().int().min(REST_MIN).max(REST_MAX).describe("Czas odpoczynku między seriami w sekundach."),
});

export const planSessionSchema = z.object({
  name: boundedText('Nazwa sesji treningowej po polsku, np. "Trening A — góra".'),
  focus: boundedText('Główny cel/obszar sesji po polsku, np. "klatka i triceps".'),
  exercises: z
    .array(planExerciseSchema)
    .max(EXERCISES_MAX)
    .describe(`Lista ćwiczeń w tej sesji (maks. ${EXERCISES_MAX}).`),
});

export const planSchema = z.object({
  sessions: z
    .array(planSessionSchema)
    .max(SESSIONS_MAX)
    .describe(
      `Sesje treningowe — dokładnie tyle, ile wynosi liczba dni treningowych użytkownika (maks. ${SESSIONS_MAX}).`,
    ),
});
