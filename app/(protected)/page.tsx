import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkoutsForUser, listExerciseTrendsForUser, listInProgressWorkoutsForUser } from "@/lib/workouts/queries";
import { buildGrowthSnapshot } from "@/lib/workouts/analytics-trend";
import { splitInProgress } from "@/lib/workouts/in-progress";
import { getTodayConditionForUser } from "@/lib/conditions/queries";
import { getTodayRecommendationForUser } from "@/lib/recommendations/queries";
import { StartWorkoutForm } from "@/components/workouts/start-workout-form";
import { InProgressWorkoutCard } from "@/components/workouts/in-progress-workout-card";
import { RecentWorkoutsSection } from "@/components/workouts/recent-workouts-section";
import { GrowthSnapshot } from "@/components/home/growth-snapshot";
import { ConditionCard } from "@/components/home/condition-card";
import { RecommendationCard } from "@/components/home/recommendation-card";

const RECENT_WORKOUT_COUNT = 3;

export default async function Home() {
  // Authenticate exactly once for this render, then hand the confirmed user.id to every internal query below
  // (the *ForUser variants, none of which authenticate on their own). Before this fix, each of the five calls
  // independently re-ran the same Auth check, and the Recommendation read alone fanned out into four more
  // internal re-checks — up to nine logical Auth lookups for one Home render. The per-request memoization this
  // project's auth helper uses normally collapses those into a single real Supabase Auth API call per render,
  // but that collapsing is an implementation detail of the helper, not something this page's own correctness
  // should depend on; it also does nothing for the separate Proxy-level check that runs before this render even
  // starts (see lib/supabase/proxy.ts) — the real fix is not re-checking auth here at all.
  const user = await requireUser();
  // Five owner-scoped queries, none per-row: recent workouts (bounded), the Analytics trend data, unfinished
  // workouts, today's Daily Condition (its own MuscleCondition rows ride along in one nested select), and
  // today's Recommendation (its ForUser variant re-reads Condition internally for the engine's own shape — an
  // accepted duplicate single-row read, not an N+1 — alongside its own candidate/history queries).
  const [recent, trends, inProgress, condition, recommendation] = await Promise.all([
    listCompletedWorkoutsForUser(user.id, RECENT_WORKOUT_COUNT), listExerciseTrendsForUser(user.id),
    listInProgressWorkoutsForUser(user.id), getTodayConditionForUser(user.id), getTodayRecommendationForUser(user.id),
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
