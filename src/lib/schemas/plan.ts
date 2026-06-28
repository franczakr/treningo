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

export const planExerciseSchema = z.object({
  name: z.string().describe("Nazwa ćwiczenia po polsku."),
  equipment: z
    .enum(Constants.public.Enums.equipment_item)
    .describe("Sprzęt wymagany do ćwiczenia — musi należeć do sprzętu dostępnego użytkownikowi."),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX).describe("Liczba serii roboczych."),
  reps: z.string().describe('Zakres lub liczba powtórzeń, np. "8–10" lub "do upadku".'),
  suggested_weight: z.string().describe('Orientacyjny ciężar, np. "orientacyjnie 40 kg", "masa ciała", "70% 1RM".'),
  rest_seconds: z.number().int().min(REST_MIN).max(REST_MAX).describe("Czas odpoczynku między seriami w sekundach."),
});

export const planSessionSchema = z.object({
  name: z.string().describe('Nazwa sesji treningowej po polsku, np. "Trening A — góra".'),
  focus: z.string().describe('Główny cel/obszar sesji po polsku, np. "klatka i triceps".'),
  exercises: z.array(planExerciseSchema).describe("Lista ćwiczeń w tej sesji."),
});

export const planSchema = z.object({
  sessions: z
    .array(planSessionSchema)
    .describe("Sesje treningowe — dokładnie tyle, ile wynosi liczba dni treningowych użytkownika."),
});
