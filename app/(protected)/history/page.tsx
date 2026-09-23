import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts } from "@/lib/workouts/queries";
import { workoutTitle } from "@/lib/workouts/calculations";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium" }).format(new Date(iso));
}
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", timeStyle: "short" }).format(new Date(iso));
}
function formatDuration(startedAt: string, completedAt: string): string {
  const totalMinutes = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

export default async function HistoryPage() {
  await requireUser();
  const workouts = await listCompletedWorkouts();
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">トレーニング履歴</h1>
    {workouts.length === 0 ? (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-400">
        まだ完了したトレーニングがありません。
      </div>
    ) : (
      <ul className="mt-4 space-y-3">
        {workouts.map((workout) => <li key={workout.id}>
          <Link href={`/workouts/${workout.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">{workoutTitle(workout.title, workout.startedAt)}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(workout.startedAt)}・{formatTime(workout.startedAt)}開始</p>
              </div>
              <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-700">
                {formatDuration(workout.startedAt, workout.completedAt)}
              </span>
            </div>
            {workout.exerciseNames.length > 0 && <p className="mt-2 truncate text-xs text-slate-500">{workout.exerciseNames.join("・")}</p>}
            <p className="mt-1 text-xs text-slate-400">本セット {workout.workingSetCount}セット完了</p>
          </Link>
        </li>)}
      </ul>
    )}
  </main>;
}
