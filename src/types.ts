// Shared application types (entities, DTOs).
//
// This is the hand-authored types surface for Treningo. Generated Supabase
// types live in `@/db/database.types` (regenerate with `npm run db:types`);
// re-export and build on top of them here — never hand-edit the generated file.

import type { z } from "zod";
import type { Database } from "@/db/database.types";
import type { planSchema, planSessionSchema, planExerciseSchema } from "@/lib/schemas/plan";

export type { Database };

// Convenience aliases over the generated schema (e.g. `Tables<"profiles">`).
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];

type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

// ── Entities & DTOs ──────────────────────────────────────────────────────────

// Training profile (S-01). One editable row per user; the inputs that drive
// personalized plan generation (S-02).
export type TrainingProfile = Tables<"profiles">;

// API-boundary payload for creating/updating a profile. `user_id` is set by the
// server from the authenticated session, never the client — so it is omitted
// here along with the DB-managed columns.
export type ProfileUpsertDto = Omit<TablesInsert<"profiles">, "id" | "user_id" | "created_at" | "updated_at">;

// Bounded choice enums (mirrored from the generated schema for convenience).
export type Goal = Enums<"goal">;
export type ExperienceLevel = Enums<"experience_level">;
export type EquipmentItem = Enums<"equipment_item">;

// Generated workout plan (S-02). Ephemeral generate-and-view — not persisted in
// this slice. Types are inferred from the Zod output schema in
// `@/lib/schemas/plan` so the LLM contract and the TS surface stay in lock-step.
export type WorkoutPlan = z.infer<typeof planSchema>;
export type PlanSession = z.infer<typeof planSessionSchema>;
export type PlanExercise = z.infer<typeof planExerciseSchema>;

// A single guardrail violation reported by the plan validator. `message` is in
// Polish — it doubles as corrective feedback fed back to the LLM on retry and as
// the text shown in the UI warning banner.
export interface Violation {
  guardrail: "equipment" | "day_count" | "goal";
  message: string;
}

// The outcome of a generation run: the best attempt, its outstanding violations,
// and whether it is fully sound (`ok === (violations.length === 0)`).
export interface PlanGenerationResult {
  plan: WorkoutPlan;
  violations: Violation[];
  ok: boolean;
}

// Saved plan (S-03). Many rows per user (history). The `plan` and
// `profile_snapshot` jsonb columns are typed to their domain shapes here rather
// than the generated raw `Json`. `profile_snapshot` captures the profile inputs
// the plan was generated from, so the saved plan stays understandable even if the
// profile later changes.
// The persisted snapshot models the profile Row (minus identity/DB-managed
// columns) — not the Insert DTO — because save derives it from a loaded profile
// where every input field is present (`number | null`, never absent).
export type ProfileSnapshot = Omit<Tables<"profiles">, "id" | "user_id" | "created_at" | "updated_at">;
export type SavedPlan = Omit<Tables<"plans">, "plan" | "profile_snapshot"> & {
  plan: WorkoutPlan;
  profile_snapshot: ProfileSnapshot;
};

// Canonical option lists shared by the form (UI) and validation. Keeping value +
// label here means the select/checkbox options and the zod enums stay in sync.
export const GOAL_OPTIONS: readonly { value: Goal; label: string }[] = [
  { value: "strength", label: "Siła" },
  { value: "muscle_gain", label: "Budowa masy mięśniowej" },
  { value: "fat_loss", label: "Redukcja tkanki tłuszczowej" },
  { value: "general_fitness", label: "Ogólna sprawność" },
];

export const EXPERIENCE_OPTIONS: readonly { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Początkujący" },
  { value: "intermediate", label: "Średniozaawansowany" },
  { value: "advanced", label: "Zaawansowany" },
];

export const EQUIPMENT_OPTIONS: readonly { value: EquipmentItem; label: string }[] = [
  { value: "barbell", label: "Sztanga" },
  { value: "dumbbells", label: "Hantle" },
  { value: "machines", label: "Maszyny" },
  { value: "pull_up_bar", label: "Drążek do podciągania" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "resistance_bands", label: "Gumy oporowe" },
  { value: "bodyweight_only", label: "Tylko masa ciała" },
];
