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

// Every constraint carries an authored Polish message. This is not cosmetic:
// these messages are rendered to the user on BOTH sides — the client mirror
// shows them per field (`TrainingProfileForm`) and the API route puts one into
// `/training-profile?error=` for the no-JS path. Zod's English defaults were
// therefore user-facing, and some of them ("Invalid option: expected one of
// …") enumerate the database enum domain — internal detail in a user-facing
// string (test-plan.md Risk #7). Authoring every message removes that class of
// leak at the source; `src/lib/schemas/profile.test.ts` pins the property that
// no zod default can reappear.
//
// Bounds themselves are unchanged and must stay in lock-step with the migration
// (see that test file's migration guard) — the constants below are interpolated
// into the messages so a future bound change cannot leave the text stale.
const MSG_REQUIRED_CHOICE = "Wybierz jedną z dostępnych opcji.";
const MSG_NUMBER = "Podaj liczbę.";

// Form fields post strings; empty optional fields arrive as "" (or are absent).
// Normalize those to `null` BEFORE coercion so a cleared field is stored as NULL
// (not 0), and so the upsert explicitly overwrites a previously-saved value.
const optionalLiftKg = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce
    .number(MSG_NUMBER)
    .positive("Podaj wartość większą od zera lub zostaw pole puste.")
    .max(LIFT_MAX, `Maksymalny ciężar to ${LIFT_MAX} kg.`)
    .nullable(),
);

const optionalPlankSeconds = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce
    .number(MSG_NUMBER)
    .int("Podaj liczbę całkowitą sekund.")
    .positive("Podaj wartość większą od zera lub zostaw pole puste.")
    .max(PLANK_MAX, `Maksymalny czas to ${PLANK_MAX} sekund.`)
    .nullable(),
);

export const profileSchema = z.object({
  goal: z.enum(Constants.public.Enums.goal, MSG_REQUIRED_CHOICE),
  experience_level: z.enum(Constants.public.Enums.experience_level, MSG_REQUIRED_CHOICE),
  age: z.coerce
    .number(MSG_NUMBER)
    .int("Podaj wiek jako liczbę całkowitą.")
    .min(AGE_MIN, `Minimalny wiek to ${AGE_MIN} lat.`)
    .max(AGE_MAX, `Maksymalny wiek to ${AGE_MAX} lat.`),
  weight_kg: z.coerce
    .number(MSG_NUMBER)
    .positive("Podaj wagę większą od zera.")
    .max(WEIGHT_MAX, `Maksymalna waga to ${WEIGHT_MAX} kg.`),
  training_days_per_week: z.coerce
    .number(MSG_NUMBER)
    .int("Podaj liczbę całkowitą dni.")
    .min(1, "Wybierz co najmniej 1 dzień treningowy.")
    .max(7, "Maksymalnie 7 dni treningowych w tygodniu."),
  equipment: z
    // Three messages, not two: the element message, the `min` message, and the
    // ARRAY-LEVEL type message. Without the last one a non-array (absent field,
    // null, a bare string) yields zod's English "Invalid input: expected array,
    // received …" — latent today because `form.getAll` always returns an array,
    // but it is exactly what this schema's guard exists to prevent.
    .array(z.enum(Constants.public.Enums.equipment_item, MSG_REQUIRED_CHOICE), "Wybierz dostępny sprzęt.")
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
