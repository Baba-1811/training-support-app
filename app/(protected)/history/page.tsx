import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts } from "@/lib/workouts/queries";
import { WorkoutSummaryCard } from "@/components/workouts/workout-summary-card";

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
        {workouts.map((workout) => <li key={workout.id}><WorkoutSummaryCard workout={workout} /></li>)}
      </ul>
    )}
  </main>;
}
