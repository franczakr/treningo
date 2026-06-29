import { useEffect, useState } from "react";
import { Loader2, RefreshCw, TriangleAlert, CircleAlert, Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionCard } from "@/components/plan/PlanCards";
import type { PlanGenerationResult, Violation, WorkoutPlan } from "@/types";

type Status = "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

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

// Outcome of a save attempt. The server re-validates the plan, so the only
// branches the client cares about are redirect (auth), error, and success.
type SaveOutcome = { kind: "redirect"; to: string } | { kind: "error"; message: string } | { kind: "ok" };

async function savePlanRequest(plan: WorkoutPlan): Promise<SaveOutcome> {
  try {
    const res = await fetch("/api/plan/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    if (res.status === 401) return { kind: "redirect", to: "/auth/signin" };
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { kind: "error", message: body?.message ?? "Nie udało się zapisać planu. Spróbuj ponownie." };
    }
    return { kind: "ok" };
  } catch {
    return { kind: "error", message: "Wystąpił problem z połączeniem. Spróbuj ponownie." };
  }
}

// Self-contained island: auto-generates a plan on mount and renders the loading
// / plan / warning / error states. The shown plan lives in component state; it is
// not auto-persisted, but the user can save it on demand (S-03) via "Zapisz plan",
// which POSTs it to /api/plan/save. Generating a new plan resets the save state.
export default function PlanView() {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<PlanGenerationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string>("");

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
      setSaveStatus("idle");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function regenerate() {
    setStatus("loading");
    setResult(null);
    setErrorMessage("");
    setSaveStatus("idle");
    setSaveError("");
    void requestPlan().then(apply);
  }

  // Persist the currently shown plan on demand. A new plan (regenerate / remount)
  // resets saveStatus to "idle" so it can be saved independently.
  function save() {
    if (!result) return;
    setSaveStatus("saving");
    setSaveError("");
    void savePlanRequest(result.plan).then((outcome) => {
      if (outcome.kind === "redirect") {
        window.location.assign(outcome.to);
        return;
      }
      if (outcome.kind === "error") {
        setSaveError(outcome.message);
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saved");
    });
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

      {saveStatus === "error" && saveError ? <p className="text-center text-sm text-red-300">{saveError}</p> : null}

      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <SaveButton status={saveStatus} onClick={save} />
        <RegenerateButton onClick={regenerate} label="Wygeneruj ponownie" />
      </div>
    </div>
  );
}

function SaveButton({ status, onClick }: { status: SaveStatus; onClick: () => void }) {
  const saved = status === "saved";
  const saving = status === "saving";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || saved}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
        saved ? "cursor-default bg-emerald-600/80" : "bg-emerald-600 hover:bg-emerald-500",
        saving && "cursor-wait opacity-80",
      )}
    >
      {saved ? (
        <Check className="size-4" />
      ) : saving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Save className="size-4" />
      )}
      {saved ? "Zapisano" : saving ? "Zapisywanie…" : "Zapisz plan"}
    </button>
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
