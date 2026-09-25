import Link from "next/link";
import type { WorkoutHistorySummaryDTO } from "@/lib/workouts/types";
import { WorkoutSummaryCard } from "./workout-summary-card";

// "Recent workouts" block shared by Home and Analytics: a few completed workouts, then a link to the full /history.
export function RecentWorkoutsSection({ workouts, historyLinkLabel }: { workouts: WorkoutHistorySummaryDTO[]; historyLinkLabel: string }) {
  return <section aria-labelledby="recent-workouts-heading">
    <h2 id="recent-workouts-heading" className="text-base font-bold text-slate-900">最近のトレーニング</h2>
    {workouts.length === 0
      ? <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
        まだ完了したトレーニングがありません。
      </div>
      : <>
        <ul className="mt-3 space-y-3">
          {workouts.map((workout) => <li key={workout.id}><WorkoutSummaryCard workout={workout} Heading="h3" /></li>)}
        </ul>
        <Link href="/history" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50">
          {historyLinkLabel}
        </Link>
      </>}
  </section>;
}
