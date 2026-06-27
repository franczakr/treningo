// Shared profile-validation schema — the single source of truth consumed by both
// the API route (server-side, the trust boundary) and the React form (client-side
// mirror). Keep it in lock-step with the DB nullability (see the migration) and
// with the option lists in `@/types`.

import { z } from "zod";
import { Constants } from "@/db/database.types";

// Sane bounds (defense-in-depth alongside the DB CHECK constraints).
const AGE_MIN = 13;
const AGE_MAX = 100;
const WEIGHT_MAX = 500; // kg
const LIFT_MAX = 1000; // kg
const PLANK_MAX = 3600; // seconds

// Form fields post strings; empty optional fields arrive as "" (or are absent).
// Normalize those to `null` BEFORE coercion so a cleared field is stored as NULL
// (not 0), and so the upsert explicitly overwrites a previously-saved value.
const optionalLiftKg = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().positive().max(LIFT_MAX).nullable(),
);

const optionalPlankSeconds = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int().positive().max(PLANK_MAX).nullable(),
);

export const profileSchema = z.object({
  goal: z.enum(Constants.public.Enums.goal),
  experience_level: z.enum(Constants.public.Enums.experience_level),
  age: z.coerce.number().int().min(AGE_MIN).max(AGE_MAX),
  weight_kg: z.coerce.number().positive().max(WEIGHT_MAX),
  training_days_per_week: z.coerce.number().int().min(1).max(7),
  equipment: z
    .array(z.enum(Constants.public.Enums.equipment_item))
    .min(1, "Wybierz co najmniej jeden element sprzętu."),
  squat_kg: optionalLiftKg,
  bench_kg: optionalLiftKg,
  deadlift_kg: optionalLiftKg,
  ohp_kg: optionalLiftKg,
  plank_seconds: optionalPlankSeconds,
});

// Inferred output type — the validated, server-trusted payload. Aligns with
// `ProfileUpsertDto` (minus the server-set `user_id`).
export type ProfileFormValues = z.infer<typeof profileSchema>;
