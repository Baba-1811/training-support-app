import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts, listExerciseTrends, listInProgressWorkouts } from "@/lib/workouts/queries";
import { buildGrowthSnapshot } from "@/lib/workouts/analytics-trend";
import { splitInProgress } from "@/lib/workouts/in-progress";
import { getTodayCondition } from "@/lib/conditions/queries";
import { getTodayRecommendation } from "@/lib/recommendations/queries";
import { StartWorkoutForm } from "@/components/workouts/start-workout-form";
import { InProgressWorkoutCard } from "@/components/workouts/in-progress-workout-card";
import { RecentWorkoutsSection } from "@/components/workouts/recent-workouts-section";
import { GrowthSnapshot } from "@/components/home/growth-snapshot";
import { ConditionCard } from "@/components/home/condition-card";
import { RecommendationCard } from "@/components/home/recommendation-card";

const RECENT_WORKOUT_COUNT = 3;

export default async function Home() {
  await requireUser();
  // Five owner-scoped queries, none per-row: recent workouts (bounded), the Analytics trend data, unfinished
  // workouts, today's Daily Condition (its own MuscleCondition rows ride along in one nested select), and
  // today's Recommendation (Phase 5C-1; getTodayRecommendation() re-reads Condition internally for the engine's
  // own shape — an accepted duplicate single-row read, not an N+1 — alongside its own candidate/history queries).
  const [recent, trends, inProgress, condition, recommendation] = await Promise.all([
    listCompletedWorkouts(RECENT_WORKOUT_COUNT), listExerciseTrends(), listInProgressWorkouts(), getTodayCondition(),
    getTodayRecommendation(),
  ]);
  const { current, others } = splitInProgress(inProgress);
  return <main className="mx-auto w-full max-w-[480px] space-y-6 px-4 py-5 text-slate-900">
    <header className="flex items-center gap-3">
      <Image src="/images/brand/app-icon.jpg" alt="" width={44} height={44} priority className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight">LoopLift</h1>
        <p className="text-xs leading-snug text-slate-500">なんとなくの筋トレを、<wbr />成長が見えるトレーニングへ。</p>
      </div>
    </header>

    {/* Condition -> Recommendation -> Workout: Recommendation reads Condition, so it is shown right after it. */}
    <ConditionCard condition={condition} />
    <RecommendationCard recommendation={recommendation} />

    {/* One primary action: resume the unfinished workout if there is one, otherwise start a new one. */}
    <section aria-label="トレーニング" className="space-y-3">
      {current
        ? <>
          <InProgressWorkoutCard workout={current} />
          {others.length > 0 && <Link href="/workouts" className="block text-center text-xs text-slate-500 underline underline-offset-2">
            ほかにも途中のトレーニングが{others.length}件あります
          </Link>}
        </>
        : <StartWorkoutForm compact />}
    </section>

    <RecentWorkoutsSection workouts={recent} historyLinkLabel="履歴をすべて見る" />
    <GrowthSnapshot snapshot={buildGrowthSnapshot(trends)} />
  </main>;
}
