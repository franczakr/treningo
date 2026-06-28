// Generated-plan output schema — the shape the LLM must return (consumed by the
// Anthropic structured-output helper) and the source of the shared plan types in
// `@/types`. Field `.describe()` text doubles as generation guidance.
//
// NOTE: structured-output JSON Schema does not carry numeric `min`/`max` or
// string-length constraints — the SDK strips them and validates client-side. The
// real guardrail enforcement (equipment ⊆ available, session count, goal
// consistency) lives in the Phase 2 validator, NOT here. The numeric bounds below
// are defense-in-depth for the client-side parse only.

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
