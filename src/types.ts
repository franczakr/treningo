// Shared application types (entities, DTOs).
//
// This is the hand-authored types surface for Treningo. Generated Supabase
// types live in `@/db/database.types` (regenerate with `npm run db:types`);
// re-export and build on top of them here — never hand-edit the generated file.

import type { Database } from "@/db/database.types";

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
