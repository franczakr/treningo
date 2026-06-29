import { Dumbbell, Clock } from "lucide-react";
import type { PlanExercise, PlanSession } from "@/types";

// Presentational plan markup shared by the generate view (PlanView) and the
// reopen view (/plan/[id]) so a plan renders identically wherever it appears.

export function SessionCard({ session, index }: { session: PlanSession; index: number }) {
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

export function ExerciseRow({ exercise }: { exercise: PlanExercise }) {
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
