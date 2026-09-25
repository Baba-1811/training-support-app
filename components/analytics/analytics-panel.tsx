import type { ExerciseTrend, WorkoutHistorySummaryDTO } from "@/lib/workouts/types";
import { RecentWorkoutsSection } from "@/components/workouts/recent-workouts-section";
import { ExerciseTrendView } from "./exercise-trend-view";

// The growth UI (trend view, then recent workouts, then the link to /history), shared by /analytics and the
// "トレーニング" page (/workouts) so both render exactly the same thing from the same data.
export function AnalyticsPanel({ trends, recent, nowIso }: { trends: ExerciseTrend[]; recent: WorkoutHistorySummaryDTO[]; nowIso: string }) {
  return <>
    <p className="mt-1 text-xs text-slate-500">完了したトレーニングの本セットから、種目ごとの成長を確認できます。</p>
    {trends.length === 0
      ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-400">
        まだ分析できる記録がありません。トレーニングを完了して本セットを記録すると、ここに推移が表示されます。
      </div>
      : <ExerciseTrendView trends={trends} nowIso={nowIso} />}
    <div className="mt-8">
      <RecentWorkoutsSection workouts={recent} historyLinkLabel="すべての履歴を見る" />
    </div>
  </>;
}
