import { Dumbbell, Clock } from "lucide-react";
import type { PlanExercise, PlanSession } from "@/types";

// Presentational plan markup shared by the generate view (PlanView) and the
// reopen view (/plan/[id]) so a plan renders identically wherever it appears.

export function SessionCard({ session, index }: { session: PlanSession; index: number }) {
  return (
    <div className="border-border bg-card text-foreground rounded-2xl border p-6">
      <h2 className="text-primary text-xl font-bold">
        {index + 1}. {session.name}
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">{session.focus}</p>
      <ul className="space-y-3">
        {session.exercises.map((exercise, i) => (
          <ExerciseRow key={i} exercise={exercise} />
        ))}
      </ul>
    </div>
  );
}

export function ExerciseRow({ exercise }: { exercise: PlanExercise }) {
  return (
    <li className="border-border bg-background rounded-lg border px-4 py-3">
      <p className="text-foreground font-medium">{exercise.name}</p>
      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1">
          <Dumbbell className="text-muted-foreground size-3.5" />
          {exercise.sets} × {exercise.reps}
        </span>
        <span>{exercise.suggested_weight}</span>
        <span className="flex items-center gap-1">
          <Clock className="text-muted-foreground size-3.5" />
          {exercise.rest_seconds} s przerwy
        </span>
      </div>
    </li>
  );
}
