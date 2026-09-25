import Link from "next/link";
import { workoutTitle } from "@/lib/workouts/calculations";
import { formatDate, formatTime } from "@/lib/workouts/history-format";
import type { InProgressWorkout } from "@/lib/workouts/in-progress";

// An unfinished workout. Once the user leaves the editor this is the only way back to it.
// "primary": info plus the one big resume button (replaces "start a new workout" as the main CTA).
// "compact": a single tappable row, for additional unfinished workouts.
export function InProgressWorkoutCard({ workout, variant = "primary" }: { workout: InProgressWorkout; variant?: "primary" | "compact" }) {
  const href = `/workouts/${workout.id}`;
  const info = <>
    <p className="text-[11px] font-semibold text-orange-700">トレーニング中</p>
    <p className="truncate text-base font-semibold text-slate-900">{workoutTitle(workout.title, workout.startedAt)}</p>
    <p className="text-xs text-slate-500">{formatDate(workout.startedAt)}・{formatTime(workout.startedAt)}開始</p>
  </>;
  if (variant === "compact") {
    return <Link href={href} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 active:bg-orange-100">
      <div className="min-w-0">{info}</div>
      <span aria-hidden className="shrink-0 text-orange-600">→</span>
    </Link>;
  }
  return <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
    <div className="min-w-0">{info}</div>
    <Link href={href} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm active:bg-orange-600">
      トレーニングを続ける
    </Link>
  </div>;
}
