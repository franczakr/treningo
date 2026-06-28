import { useEffect, useState } from "react";
import { Loader2, RefreshCw, TriangleAlert, CircleAlert, Dumbbell, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanGenerationResult, PlanExercise, PlanSession, Violation } from "@/types";

type Status = "loading" | "success" | "error";

// Module-level so it's a stable reference for the effect/callback (no re-runs).
type Outcome =
  | { kind: "redirect"; to: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: PlanGenerationResult };

async function requestPlan(): Promise<Outcome> {
  try {
    const res = await fetch("/api/plan/generate", { method: "POST" });

    // Branch on the endpoint's distinct status codes.
    if (res.status === 401) return { kind: "redirect", to: "/auth/signin" };
    if (res.status === 422) return { kind: "redirect", to: "/training-profile" };
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { kind: "error", message: body?.message ?? "Nie udało się wygenerować planu. Spróbuj ponownie." };
    }
    const data = (await res.json()) as PlanGenerationResult;
    return { kind: "ok", data };
  } catch {
    return { kind: "error", message: "Wystąpił problem z połączeniem. Spróbuj ponownie." };
  }
}

// Self-contained island: auto-generates a plan on mount and renders the loading
// / plan / warning / error states. The plan is ephemeral (S-02) — held only in
// this component's state, never persisted.
export default function PlanView() {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<PlanGenerationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  function apply(outcome: Outcome) {
    if (outcome.kind === "redirect") {
      window.location.assign(outcome.to);
      return;
    }
    if (outcome.kind === "error") {
      setErrorMessage(outcome.message);
      setStatus("error");
      return;
    }
    setResult(outcome.data);
    setStatus("success");
  }

  // Generate on mount. State is applied only after the async fetch resolves (not
  // synchronously during the effect), and the cancelled flag avoids a state
  // update if the component unmounts mid-request. The effect closes over only
  // stable state setters + the module-level requestPlan, so deps stay empty.
  useEffect(() => {
    let cancelled = false;
    void requestPlan().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "redirect") {
        window.location.assign(outcome.to);
        return;
      }
      if (outcome.kind === "error") {
        setErrorMessage(outcome.message);
        setStatus("error");
        return;
      }
      setResult(outcome.data);
      setStatus("success");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function regenerate() {
    setStatus("loading");
    setResult(null);
    setErrorMessage("");
    void requestPlan().then(apply);
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-10 text-white backdrop-blur-xl">
        <Loader2 className="size-8 animate-spin text-purple-300" />
        <p className="text-blue-100/80">Generuję Twój plan… to może potrwać kilkanaście sekund.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/30 bg-red-900/20 p-10 text-center text-white backdrop-blur-xl">
        <CircleAlert className="size-8 text-red-300" />
        <p className="text-red-100">{errorMessage}</p>
        <RegenerateButton onClick={regenerate} label="Spróbuj ponownie" />
      </div>
    );
  }

  // status === "success"
  const plan = result?.plan;
  return (
    <div className="space-y-5">
      {result && !result.ok ? <WarningBanner violations={result.violations} /> : null}

      {plan?.sessions.map((session, i) => (
        <SessionCard key={i} session={session} index={i} />
      ))}

      <div className="flex justify-center pt-2">
        <RegenerateButton onClick={regenerate} label="Wygeneruj ponownie" />
      </div>
    </div>
  );
}

function WarningBanner({ violations }: { violations: Violation[] }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-900/20 p-4 text-amber-100 backdrop-blur-xl">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 shrink-0" />
        Plan może nie spełniać wszystkich wymagań:
      </p>
      <ul className="list-inside list-disc space-y-1 text-sm text-amber-100/90">
        {violations.map((v, i) => (
          <li key={i}>{v.message}</li>
        ))}
      </ul>
    </div>
  );
}

function SessionCard({ session, index }: { session: PlanSession; index: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
      <h2 className="text-xl font-bold text-purple-200">
        {index + 1}. {session.name}
      </h2>
      <p className="mb-4 text-sm text-blue-100/70">{session.focus}</p>
      <ul className="space-y-3">
        {session.exercises.map((exercise, i) => (
          <ExerciseRow key={i} exercise={exercise} />
        ))}
      </ul>
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: PlanExercise }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <p className="font-medium text-white">{exercise.name}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-blue-100/80">
        <span className="flex items-center gap-1">
          <Dumbbell className="size-3.5 text-white/40" />
          {exercise.sets} × {exercise.reps}
        </span>
        <span>{exercise.suggested_weight}</span>
        <span className="flex items-center gap-1">
          <Clock className="size-3.5 text-white/40" />
          {exercise.rest_seconds} s przerwy
        </span>
      </div>
    </li>
  );
}

function RegenerateButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white",
        "transition-colors hover:bg-purple-500",
      )}
    >
      <RefreshCw className="size-4" />
      {label}
    </button>
  );
}
