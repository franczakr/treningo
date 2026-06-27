import type { ReactNode } from "react";
import { useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Target,
  Gauge,
  Calendar,
  Scale,
  CalendarDays,
  Dumbbell,
  Timer,
  Save,
} from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
import { profileSchema } from "@/lib/schemas/profile";
import { GOAL_OPTIONS, EXPERIENCE_OPTIONS, EQUIPMENT_OPTIONS } from "@/types";
import type { TrainingProfile } from "@/types";

interface Props {
  initial?: TrainingProfile | null;
  serverError?: string | null;
  saved?: boolean;
}

// Number inputs hold their value as a string (native form serialization); empty
// string means "not provided". Helper to seed from a possibly-null DB value.
function numToStr(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon: ReactNode;
  children: ReactNode;
}

function SelectField({ id, label, value, onChange, error, icon, children }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <div className="relative">
        <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">{icon}</span>
        <select
          id={id}
          name={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cn(
            "w-full appearance-none rounded-lg border bg-white/10 px-3 py-2 pl-10 text-white transition-colors focus:ring-2 focus:outline-none",
            error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          {children}
        </select>
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function TrainingProfileForm({ initial, serverError, saved }: Props) {
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [experience, setExperience] = useState(initial?.experience_level ?? "");
  const [age, setAge] = useState(numToStr(initial?.age));
  const [weight, setWeight] = useState(numToStr(initial?.weight_kg));
  const [days, setDays] = useState(numToStr(initial?.training_days_per_week));
  const [equipment, setEquipment] = useState<string[]>(initial?.equipment ?? []);
  const [squat, setSquat] = useState(numToStr(initial?.squat_kg));
  const [bench, setBench] = useState(numToStr(initial?.bench_kg));
  const [deadlift, setDeadlift] = useState(numToStr(initial?.deadlift_kg));
  const [ohp, setOhp] = useState(numToStr(initial?.ohp_kg));
  const [plank, setPlank] = useState(numToStr(initial?.plank_seconds));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleEquipment(value: string) {
    setEquipment((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    clearError("equipment");
  }

  function clearError(field: string) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  // Client-side mirror of the server trust boundary: validate with the same zod
  // schema. The server re-validates on POST regardless.
  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = profileSchema.safeParse({
      goal,
      experience_level: experience,
      age,
      weight_kg: weight,
      training_days_per_week: days,
      equipment,
      squat_kg: squat,
      bench_kg: bench,
      deadlift_kg: deadlift,
      ohp_kg: ohp,
      plank_seconds: plank,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/profile" className="space-y-5" onSubmit={handleSubmit} noValidate>
      {saved ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          Profil zapisany.
        </p>
      ) : null}

      <ServerError message={serverError} />

      <SelectField
        id="goal"
        label="Cel treningowy"
        value={goal}
        onChange={(v) => {
          setGoal(v);
          clearError("goal");
        }}
        error={errors.goal}
        icon={<Target className="size-4" />}
      >
        <option value="" disabled className="text-slate-900">
          Wybierz cel…
        </option>
        {GOAL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-slate-900">
            {o.label}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="experience_level"
        label="Poziom zaawansowania"
        value={experience}
        onChange={(v) => {
          setExperience(v);
          clearError("experience_level");
        }}
        error={errors.experience_level}
        icon={<Gauge className="size-4" />}
      >
        <option value="" disabled className="text-slate-900">
          Wybierz poziom…
        </option>
        {EXPERIENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-slate-900">
            {o.label}
          </option>
        ))}
      </SelectField>

      <FormField
        id="age"
        type="number"
        label="Wiek"
        value={age}
        onChange={(v) => {
          setAge(v);
          clearError("age");
        }}
        placeholder="np. 30"
        error={errors.age}
        icon={<Calendar className="size-4" />}
      />

      <FormField
        id="weight_kg"
        type="number"
        label="Waga (kg)"
        value={weight}
        onChange={(v) => {
          setWeight(v);
          clearError("weight_kg");
        }}
        placeholder="np. 75"
        error={errors.weight_kg}
        icon={<Scale className="size-4" />}
      />

      <FormField
        id="training_days_per_week"
        type="number"
        label="Dni treningowe w tygodniu (1–7)"
        value={days}
        onChange={(v) => {
          setDays(v);
          clearError("training_days_per_week");
        }}
        placeholder="np. 4"
        error={errors.training_days_per_week}
        icon={<CalendarDays className="size-4" />}
      />

      <fieldset>
        <legend className="mb-2 block text-sm text-blue-100/80">Dostępny sprzęt</legend>
        <div className="grid grid-cols-2 gap-2">
          {EQUIPMENT_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10"
            >
              <input
                type="checkbox"
                name="equipment"
                value={o.value}
                checked={equipment.includes(o.value)}
                onChange={() => {
                  toggleEquipment(o.value);
                }}
                className="size-4 accent-purple-500"
              />
              {o.label}
            </label>
          ))}
        </div>
        {errors.equipment ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            Wybierz co najmniej jeden element sprzętu.
          </p>
        ) : null}
      </fieldset>

      <div className="space-y-1">
        <p className="text-sm text-blue-100/80">Aktualne wyniki (opcjonalnie)</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="squat_kg"
            type="number"
            label="Przysiad (kg)"
            value={squat}
            onChange={(v) => {
              setSquat(v);
              clearError("squat_kg");
            }}
            placeholder="—"
            error={errors.squat_kg}
            icon={<Dumbbell className="size-4" />}
          />
          <FormField
            id="bench_kg"
            type="number"
            label="Wyciskanie (kg)"
            value={bench}
            onChange={(v) => {
              setBench(v);
              clearError("bench_kg");
            }}
            placeholder="—"
            error={errors.bench_kg}
            icon={<Dumbbell className="size-4" />}
          />
          <FormField
            id="deadlift_kg"
            type="number"
            label="Martwy ciąg (kg)"
            value={deadlift}
            onChange={(v) => {
              setDeadlift(v);
              clearError("deadlift_kg");
            }}
            placeholder="—"
            error={errors.deadlift_kg}
            icon={<Dumbbell className="size-4" />}
          />
          <FormField
            id="ohp_kg"
            type="number"
            label="Wyciskanie nad głowę (kg)"
            value={ohp}
            onChange={(v) => {
              setOhp(v);
              clearError("ohp_kg");
            }}
            placeholder="—"
            error={errors.ohp_kg}
            icon={<Dumbbell className="size-4" />}
          />
        </div>
        <FormField
          id="plank_seconds"
          type="number"
          label="Deska (sekundy)"
          value={plank}
          onChange={(v) => {
            setPlank(v);
            clearError("plank_seconds");
          }}
          placeholder="—"
          error={errors.plank_seconds}
          icon={<Timer className="size-4" />}
        />
      </div>

      <SubmitButton pendingText="Zapisywanie…" icon={<Save className="size-4" />}>
        Zapisz profil
      </SubmitButton>
    </form>
  );
}
