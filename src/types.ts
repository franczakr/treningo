// Shared application types (entities, DTOs).
//
// This is the hand-authored types surface for Treningo. Generated Supabase
// types live in `@/db/database.types` (regenerate with `npm run db:types`);
// re-export and build on top of them here — never hand-edit the generated file.

import type { Database } from "@/db/database.types";

export type { Database };

// Convenience aliases over the generated schema. Usable once tables exist
// (e.g. `Tables<"profiles">`); the `public.Tables` map is empty until S-01
// adds the first migration, so these resolve to `never` for now.
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];

// ── Entities & DTOs ──────────────────────────────────────────────────────────
// Hand-authored domain entities and data-transfer objects go below.
// S-01 (training-profile) adds the first entries (e.g. TrainingProfile, ProfileDto).
