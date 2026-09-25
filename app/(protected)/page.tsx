import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts, listExerciseTrends, listInProgressWorkouts } from "@/lib/workouts/queries";
import { buildGrowthSnapshot } from "@/lib/workouts/analytics-trend";
import { splitInProgress } from "@/lib/workouts/in-progress";
import { StartWorkoutForm } from "@/components/workouts/start-workout-form";
import { InProgressWorkoutCard } from "@/components/workouts/in-progress-workout-card";
import { RecentWorkoutsSection } from "@/components/workouts/recent-workouts-section";
import { GrowthSnapshot } from "@/components/home/growth-snapshot";

const RECENT_WORKOUT_COUNT = 3;

export default async function Home() {
  await requireUser();
  // Three owner-scoped queries, none per-row: recent workouts (bounded), the Analytics trend data, unfinished workouts.
  const [recent, trends, inProgress] = await Promise.all([
    listCompletedWorkouts(RECENT_WORKOUT_COUNT), listExerciseTrends(), listInProgressWorkouts(),
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
