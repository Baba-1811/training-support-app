import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts, listExerciseTrends, listInProgressWorkouts } from "@/lib/workouts/queries";
import { splitInProgress } from "@/lib/workouts/in-progress";
import { StartWorkoutForm } from "@/components/workouts/start-workout-form";
import { InProgressWorkoutCard } from "@/components/workouts/in-progress-workout-card";
import { ExerciseLibraryLink } from "@/components/workouts/exercise-library-link";
import { AnalyticsPanel } from "@/components/analytics/analytics-panel";

const RECENT_WORKOUT_COUNT = 3;

// "トレーニング" tab: resume or start a workout, then growth (analytics), recent workouts and the link to /history.
export default async function TrainingPage() {
  await requireUser();
  const [inProgress, trends, recent] = await Promise.all([
    listInProgressWorkouts(), listExerciseTrends(), listCompletedWorkouts(RECENT_WORKOUT_COUNT),
  ]);
  const { current, others } = splitInProgress(inProgress);
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">トレーニング</h1>
    <section aria-label="トレーニングの記録" className="mt-4 space-y-3">
      {current
        ? <>
          <InProgressWorkoutCard workout={current} />
          {others.length > 0 && <div>
            <h2 className="mb-2 text-xs font-semibold text-slate-500">ほかの途中のトレーニング</h2>
            <ul className="space-y-2">
              {others.map((workout) => <li key={workout.id}><InProgressWorkoutCard workout={workout} variant="compact" /></li>)}
            </ul>
          </div>}
          {/* Deliberately quiet: while something is in progress, resuming is the main action. */}
          <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <summary className="min-h-6 cursor-pointer text-slate-500">新しいトレーニングを始める</summary>
            <div className="mt-3"><StartWorkoutForm /></div>
          </details>
        </>
        : <StartWorkoutForm />}
    </section>
    <section aria-label="種目ライブラリ" className="mt-4"><ExerciseLibraryLink /></section>
    <section aria-labelledby="growth-heading" className="mt-6">
      <h2 id="growth-heading" className="text-base font-bold">成長</h2>
      <AnalyticsPanel trends={trends} recent={recent} nowIso={new Date().toISOString()} />
    </section>
  </main>;
}
