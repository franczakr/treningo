// Prompt builder for plan generation. Turns a TrainingProfile into a system +
// user prompt pair, encoding the FR-003 hard requirements as explicit
// instructions. The structured-output schema (see `@/lib/schemas/plan`)
// guarantees the JSON *shape*; this prompt is what steers the model toward a plan
// that also respects the *semantics* (equipment, day count, goal). The validator
// (see `@/lib/services/plan-validator`) is the actual enforcement — this is the
// first line of defence plus the corrective-feedback channel on retries.

import { Constants } from "@/db/database.types";
import { EQUIPMENT_OPTIONS, EXPERIENCE_OPTIONS, GOAL_OPTIONS } from "@/types";
import type { TrainingProfile, Violation } from "@/types";

function labelFor(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// All equipment enum values, for the "valid tags" instruction.
const ALL_EQUIPMENT = Constants.public.Enums.equipment_item.join(", ");

const SYSTEM = `Jesteś doświadczonym trenerem personalnym. Tworzysz spersonalizowane plany treningowe oparte na profilu użytkownika.

ZASADY (bezwzględne):
1. Plan MUSI zawierać DOKŁADNIE tyle sesji treningowych, ile wynosi liczba dni treningowych użytkownika — nie więcej i nie mniej.
2. Każde ćwiczenie MUSI używać wyłącznie sprzętu dostępnego użytkownikowi. Pole "equipment" każdego ćwiczenia MUSI być jedną z dozwolonych wartości enum: ${ALL_EQUIPMENT}. Używaj tylko tych, które użytkownik ma do dyspozycji.
3. Dobór ćwiczeń, liczba serii, zakresy powtórzeń i czas odpoczynku MUSZĄ być spójne z celem i poziomem zaawansowania użytkownika.
4. Sugerowane ciężary: jeśli podano wyniki w bojach (przysiad/wyciskanie/martwy ciąg/wyciskanie nad głowę), wyprowadź ciężary jako procent tych wyników. W przeciwnym razie podaj zachowawcze ciężary startowe na podstawie poziomu i masy ciała, oznaczone jako orientacyjne.
5. CAŁA treść (nazwy sesji, opisy, nazwy ćwiczeń, ciężary, powtórzenia) MUSI być po polsku.

Zwróć wyłącznie ustrukturyzowany plan zgodny z podanym schematem.`;

export function buildPlanPrompt(profile: TrainingProfile, violations?: Violation[]): { system: string; user: string } {
  const availableEquipment = profile.equipment.map((e) => `${labelFor(EQUIPMENT_OPTIONS, e)} (${e})`).join(", ");

  const lifts: string[] = [];
  if (profile.squat_kg != null) lifts.push(`przysiad: ${profile.squat_kg} kg`);
  if (profile.bench_kg != null) lifts.push(`wyciskanie leżąc: ${profile.bench_kg} kg`);
  if (profile.deadlift_kg != null) lifts.push(`martwy ciąg: ${profile.deadlift_kg} kg`);
  if (profile.ohp_kg != null) lifts.push(`wyciskanie nad głowę: ${profile.ohp_kg} kg`);
  if (profile.plank_seconds != null) lifts.push(`deska: ${profile.plank_seconds} s`);
  const liftsText = lifts.length > 0 ? lifts.join(", ") : "brak podanych wyników";

  const userParts = [
    "Profil użytkownika:",
    `- Cel: ${labelFor(GOAL_OPTIONS, profile.goal)} (${profile.goal})`,
    `- Poziom zaawansowania: ${labelFor(EXPERIENCE_OPTIONS, profile.experience_level)} (${profile.experience_level})`,
    `- Wiek: ${profile.age} lat`,
    `- Masa ciała: ${profile.weight_kg} kg`,
    `- Liczba dni treningowych w tygodniu: ${profile.training_days_per_week} (wygeneruj DOKŁADNIE ${profile.training_days_per_week} sesji)`,
    `- Dostępny sprzęt: ${availableEquipment}`,
    `- Wyniki siłowe: ${liftsText}`,
    "",
    `Wygeneruj plan z dokładnie ${profile.training_days_per_week} sesjami, używając wyłącznie wymienionego sprzętu.`,
  ];

  if (violations && violations.length > 0) {
    userParts.push(
      "",
      "UWAGA: Poprzednia próba naruszyła poniższe wymagania. Popraw je w tej wersji:",
      ...violations.map((v) => `- ${v.message}`),
    );
  }

  return { system: SYSTEM, user: userParts.join("\n") };
}
