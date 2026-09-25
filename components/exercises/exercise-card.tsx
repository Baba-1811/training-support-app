import Link from "next/link";
import { exerciseImage } from "@/lib/exercises/assets";
import { equipmentLabel, exerciseLabel, muscleLabel } from "@/lib/exercises/labels";
import type { ExerciseSummaryDTO } from "@/lib/exercises/types";
import { ExerciseImage } from "./exercise-image";

// One exercise as a tappable row: picture, Japanese name (English as a small aid), equipment and its PRIMARY muscles.
export function ExerciseCard({ exercise }: { exercise: ExerciseSummaryDTO }) {
  const image = exerciseImage(exercise.name, exercise.primaryMuscles);
  return <Link href={`/exercises/${exercise.id}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm active:bg-slate-50">
    <ExerciseImage image={image} sizes="112px" className="aspect-[4/3] w-28 shrink-0 rounded-xl" />
    <div className="min-w-0 flex-1 self-center">
      <h3 className="truncate text-base font-semibold text-slate-900">{exerciseLabel(exercise.name)}</h3>
      <p className="truncate text-[11px] text-slate-400">{exercise.name}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">{equipmentLabel(exercise.equipmentType)}</span>
        {exercise.primaryMuscles.length > 0 && <span className="text-xs font-medium text-orange-700">{exercise.primaryMuscles.map(muscleLabel).join("・")}</span>}
      </div>
    </div>
    <span aria-hidden className="shrink-0 self-center text-slate-300">›</span>
  </Link>;
}
