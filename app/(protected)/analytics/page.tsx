import { requireUser } from "@/lib/auth/require-user";
import { listExerciseTrends } from "@/lib/workouts/queries";
import { ExerciseTrendView } from "@/components/analytics/exercise-trend-view";

export default async function AnalyticsPage() {
  await requireUser();
  const trends = await listExerciseTrends();
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">分析</h1>
    <p className="mt-1 text-xs text-slate-500">完了したトレーニングの本セットから、種目ごとの成長を確認できます。</p>
    {trends.length === 0
      ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-400">
        まだ分析できる記録がありません。トレーニングを完了して本セットを記録すると、ここに推移が表示されます。
      </div>
      : <ExerciseTrendView trends={trends} nowIso={new Date().toISOString()} />}
  </main>;
}
