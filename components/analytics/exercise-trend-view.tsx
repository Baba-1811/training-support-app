"use client";
import { useMemo, useState } from "react";
import { formatChartDate, formatE1rm, formatE1rmDelta, formatVolume, formatVolumeDelta } from "@/lib/workouts/analytics-format";
import { filterPointsByPeriod, summarizeTrend } from "@/lib/workouts/analytics-trend";
import type { ExerciseTrend, TrendPeriod } from "@/lib/workouts/types";
import { TrendChart } from "./trend-chart";

const PERIODS: Array<{ value: TrendPeriod; label: string }> = [
  { value: "1M", label: "1か月" }, { value: "3M", label: "3か月" }, { value: "ALL", label: "全期間" },
];

function deltaClass(delta: number): string {
  return delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400";
}

function SummaryCard({ label, value, delta, formatDelta }: {
  label: string; value: string; delta: number | null; formatDelta: (kg: number) => string;
}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    <p className="mt-1 text-xs tabular-nums">
      {delta === null
        ? <span className="text-slate-400">比較データなし</span>
        : <><span className="text-slate-400">期間内 </span><span className={`font-semibold ${deltaClass(delta)}`}>{formatDelta(delta)}</span></>}
    </p>
  </div>;
}

// `nowIso` comes from the server so the period boundary is stable across SSR and hydration.
export function ExerciseTrendView({ trends, nowIso }: { trends: ExerciseTrend[]; nowIso: string }) {
  const [exerciseId, setExerciseId] = useState(trends[0].exerciseId);
  const [period, setPeriod] = useState<TrendPeriod>("3M");
  const trend = trends.find((item) => item.exerciseId === exerciseId) ?? trends[0];
  const points = useMemo(() => filterPointsByPeriod(trend.points, period, new Date(nowIso)), [trend, period, nowIso]);
  const summary = useMemo(() => summarizeTrend(points), [points]);
  const { latest, comparison } = summary;

  return <div className="mt-4 space-y-4">
    <div>
      <label htmlFor="trend-exercise" className="text-[11px] font-medium text-slate-500">種目</label>
      <select id="trend-exercise" value={trend.exerciseId} onChange={(event) => setExerciseId(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm">
        {trends.map((item) => <option key={item.exerciseId} value={item.exerciseId}>{item.name}</option>)}
      </select>
      <p className="mt-1 text-[11px] text-slate-400">最近実施した順</p>
    </div>

    <div role="group" aria-label="期間" className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {PERIODS.map((item) => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}
        className={`rounded-lg py-2 text-sm font-medium ${period === item.value ? "bg-orange-500 text-white" : "text-slate-600 active:bg-slate-100"}`}>
        {item.label}
      </button>)}
    </div>

    {latest === null ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-400">
      この期間には記録がありません。期間を広げてみてください。
    </div> : <>
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="現在の推定1RM" value={formatE1rm(latest.e1rmKg)} delta={comparison?.e1rmDeltaKg ?? null} formatDelta={formatE1rmDelta} />
        <SummaryCard label="現在のVolume" value={formatVolume(latest.volumeKg)} delta={comparison?.volumeDeltaKg ?? null} formatDelta={formatVolumeDelta} />
      </div>
      <p className="text-[11px] text-slate-400">現在＝期間内の最新（{formatChartDate(latest.startedAt)}）。変化量＝最新 − 期間内の最古。</p>

      {summary.pointCount < 2
        ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
          この期間の記録はまだ1回です。2回以上記録すると推移グラフが表示されます。
        </div>
        : <>
          <TrendChart title="推定1RMの推移 (kg)" color="#ea580c" formatValue={formatE1rm}
            points={points.map((point) => ({ t: new Date(point.startedAt).getTime(), value: point.e1rmKg }))} />
          <TrendChart title="Volumeの推移 (kg)" color="#475569" formatValue={formatVolume}
            points={points.map((point) => ({ t: new Date(point.startedAt).getTime(), value: point.volumeKg }))} />
        </>}
    </>}
  </div>;
}
