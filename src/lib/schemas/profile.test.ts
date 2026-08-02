import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/schemas/profile";

// A complete, valid input. Every boundary test below overrides exactly one
// field — the oracle for each expectation is the DB CHECK clause quoted in
// the describe title (transcribed from the migration file), never a
// re-derivation of profileSchema's own logic.
const validInput = {
  goal: "strength",
  experience_level: "beginner",
  age: 30,
  weight_kg: 80,
  training_days_per_week: 3,
  equipment: ["barbell"],
  squat_kg: null,
  bench_kg: null,
  deadlift_kg: null,
  ohp_kg: null,
  plank_seconds: null,
};

function parses(overrides: Record<string, unknown>): boolean {
  return profileSchema.safeParse({ ...validInput, ...overrides }).success;
}

describe("profileSchema boundary parity", () => {
  // Bounds below are transcribed from
  // supabase/migrations/20260627202445_create_profiles.sql (SQL line quoted
  // per case) — never re-derived from profileSchema's own source. See the
  // "migration text guard" block below, which cross-checks the transcription
  // itself against the file on disk.

  describe("age — DB: check (age between 13 and 100)", () => {
    it("accepts the inclusive bounds", () => {
      expect(parses({ age: 13 })).toBe(true);
      expect(parses({ age: 100 })).toBe(true);
    });
    it("rejects one below and one above the bounds", () => {
      expect(parses({ age: 12 })).toBe(false);
      expect(parses({ age: 101 })).toBe(false);
    });
  });

  describe("weight_kg — DB: check (weight_kg > 0 and weight_kg <= 500)", () => {
    it("accepts the inclusive upper bound and a small positive value", () => {
      expect(parses({ weight_kg: 500 })).toBe(true);
      expect(parses({ weight_kg: 0.1 })).toBe(true);
    });
    it("rejects zero and one above the upper bound", () => {
      expect(parses({ weight_kg: 0 })).toBe(false);
      expect(parses({ weight_kg: 500.1 })).toBe(false);
    });
  });

  describe("training_days_per_week — DB: check (training_days_per_week between 1 and 7)", () => {
    it("accepts the inclusive bounds", () => {
      expect(parses({ training_days_per_week: 1 })).toBe(true);
      expect(parses({ training_days_per_week: 7 })).toBe(true);
    });
    it("rejects zero and one above the upper bound", () => {
      expect(parses({ training_days_per_week: 0 })).toBe(false);
      expect(parses({ training_days_per_week: 8 })).toBe(false);
    });
  });

  describe("equipment — DB: check (array_length(equipment, 1) >= 1)", () => {
    it("accepts a non-empty array", () => {
      expect(parses({ equipment: ["barbell"] })).toBe(true);
    });
    // Defense-in-depth note: the DB CHECK above is a documented no-op for an
    // empty array (array_length('{}', 1) is NULL, and a Postgres CHECK
    // passes on NULL — see research.md Defect A). zod is the only layer that
    // actually enforces this today; this test proves that layer, not the DB.
    it("rejects an empty array", () => {
      expect(parses({ equipment: [] })).toBe(false);
    });
  });

  describe.each(["squat_kg", "bench_kg", "deadlift_kg", "ohp_kg"] as const)(
    "%s — DB: check (%s is null or (%s > 0 and %s <= 1000))",
    (field) => {
      it("accepts null, the inclusive upper bound, and a small positive value", () => {
        expect(parses({ [field]: null })).toBe(true);
        expect(parses({ [field]: 1000 })).toBe(true);
        expect(parses({ [field]: 0.1 })).toBe(true);
      });
      it("rejects zero and one above the upper bound", () => {
        expect(parses({ [field]: 0 })).toBe(false);
        expect(parses({ [field]: 1000.1 })).toBe(false);
      });
    },
  );

  describe("plank_seconds — DB: check (plank_seconds is null or (plank_seconds > 0 and plank_seconds <= 3600))", () => {
    it("accepts null and the inclusive bounds", () => {
      expect(parses({ plank_seconds: null })).toBe(true);
      expect(parses({ plank_seconds: 1 })).toBe(true);
      expect(parses({ plank_seconds: 3600 })).toBe(true);
    });
    // The exact value that once passed both validation layers and failed at
    // insert (training-profile impl-review F1). Regression guard: asserted
    // here directly, not re-derived from any predicate.
    it("rejects zero", () => {
      expect(parses({ plank_seconds: 0 })).toBe(false);
    });
    it("rejects one above the upper bound", () => {
      expect(parses({ plank_seconds: 3601 })).toBe(false);
    });
  });

  describe.each(["squat_kg", "bench_kg", "deadlift_kg", "ohp_kg", "plank_seconds"] as const)(
    "%s — absent/null normalization",
    (field) => {
      it("normalizes an empty string to a stored null (never 0)", () => {
        const result = profileSchema.safeParse({ ...validInput, [field]: "" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data[field]).toBeNull();
        }
      });

      it("normalizes an absent field to a stored null (never 0)", () => {
        const { [field]: _omitted, ...withoutField } = validInput;
        const result = profileSchema.safeParse(withoutField);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data[field]).toBeNull();
        }
      });
    },
  );
});

describe("migration text guard", () => {
  // Detects DRIFT — the transcribed SQL clauses above changing without this
  // file being revisited. It does NOT detect INCORRECTNESS: a CHECK clause
  // that was wrong from the start (the equipment array-length clause above
  // is the standing example) will keep passing this guard forever, since its
  // text never changes. See research.md for the full account.
  const migrationPath = fileURLToPath(
    new URL("../../../supabase/migrations/20260627202445_create_profiles.sql", import.meta.url),
  );
  const migrationSql = readFileSync(migrationPath, "utf-8");

  it.each([
    "check (age between 13 and 100)",
    "check (weight_kg > 0 and weight_kg <= 500)",
    "check (training_days_per_week between 1 and 7)",
    "check (array_length(equipment, 1) >= 1)",
    "check (squat_kg is null or (squat_kg > 0 and squat_kg <= 1000))",
    "check (bench_kg is null or (bench_kg > 0 and bench_kg <= 1000))",
    "check (deadlift_kg is null or (deadlift_kg > 0 and deadlift_kg <= 1000))",
    "check (ohp_kg is null or (ohp_kg > 0 and ohp_kg <= 1000))",
    "check (plank_seconds is null or (plank_seconds > 0 and plank_seconds <= 3600))",
  ])("migration still contains: %s", (clause) => {
    expect(migrationSql).toContain(clause);
  });
});
