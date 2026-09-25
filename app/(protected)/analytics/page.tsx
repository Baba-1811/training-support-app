import { requireUser } from "@/lib/auth/require-user";
import { listCompletedWorkouts, listExerciseTrends } from "@/lib/workouts/queries";
import { AnalyticsPanel } from "@/components/analytics/analytics-panel";

const RECENT_WORKOUT_COUNT = 3;

// Still reachable by URL (and from older links); the "トレーニング" page shows the same panel.
export default async function AnalyticsPage() {
  await requireUser();
  const [trends, recent] = await Promise.all([listExerciseTrends(), listCompletedWorkouts(RECENT_WORKOUT_COUNT)]);
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">分析</h1>
    <AnalyticsPanel trends={trends} recent={recent} nowIso={new Date().toISOString()} />
  </main>;
}
