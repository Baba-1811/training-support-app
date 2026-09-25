import Link from "next/link";
import { workoutTitle } from "@/lib/workouts/calculations";
import { formatDate, formatDuration, formatTime } from "@/lib/workouts/history-format";
import type { WorkoutHistorySummaryDTO } from "@/lib/workouts/types";

// One completed workout as a tappable card linking to the existing workout detail. Shared by History, Home and Analytics.
export function WorkoutSummaryCard({ workout, Heading = "h2" }: { workout: WorkoutHistorySummaryDTO; Heading?: "h2" | "h3" }) {
  return <Link href={`/workouts/${workout.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading className="truncate text-base font-semibold text-slate-900">{workoutTitle(workout.title, workout.startedAt)}</Heading>
        <p className="mt-0.5 text-xs text-slate-500">{formatDate(workout.startedAt)}・{formatTime(workout.startedAt)}開始</p>
      </div>
      <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-700">
        {formatDuration(workout.startedAt, workout.completedAt)}
      </span>
    </div>
    {workout.exerciseNames.length > 0 && <p className="mt-2 truncate text-xs text-slate-500">{workout.exerciseNames.join("・")}</p>}
    <p className="mt-1 text-xs text-slate-400">本セット {workout.workingSetCount}セット完了</p>
  </Link>;
}
