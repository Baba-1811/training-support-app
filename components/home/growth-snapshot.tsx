import Link from "next/link";
import { formatChartDate, formatE1rm, formatE1rmDelta, formatVolume, formatVolumeDelta } from "@/lib/workouts/analytics-format";
import type { buildGrowthSnapshot } from "@/lib/workouts/analytics-trend";

type Snapshot = NonNullable<ReturnType<typeof buildGrowthSnapshot>>;

function deltaClass(delta: number): string {
  return delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400";
}

function Tile({ label, value, delta, formatDelta }: { label: string; value: string; delta: number | null; formatDelta: (kg: number) => string }) {
  return <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
    <p className="mt-0.5 text-xs tabular-nums">
      {delta === null
        ? <span className="text-slate-400">前回記録なし</span>
        : <><span className="text-slate-400">前回比 </span><span className={`font-semibold ${deltaClass(delta)}`}>{formatDelta(delta)}</span></>}
    </p>
  </div>;
}

// Latest performance of the most recently trained exercise. Values come from the Analytics trend data (never recomputed here).
export function GrowthSnapshot({ snapshot }: { snapshot: Snapshot | null }) {
  return <section aria-labelledby="growth-snapshot-heading">
    <h2 id="growth-snapshot-heading" className="text-base font-bold text-slate-900">成長スナップショット</h2>
    {snapshot === null
      ? <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
        トレーニングを完了して本セットを記録すると、ここに成長が表示されます。
      </div>
      : <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{snapshot.name}</p>
          <p className="shrink-0 text-[11px] text-slate-400">{formatChartDate(snapshot.latest.startedAt)}の記録</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile label="推定1RM" value={formatE1rm(snapshot.latest.e1rmKg)} delta={snapshot.comparison?.e1rmDeltaKg ?? null} formatDelta={formatE1rmDelta} />
          <Tile label="Volume" value={formatVolume(snapshot.latest.volumeKg)} delta={snapshot.comparison?.volumeDeltaKg ?? null} formatDelta={formatVolumeDelta} />
        </div>
        <Link href="/workouts" className="mt-3 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-orange-600 active:bg-orange-50">
          分析をくわしく見る
        </Link>
      </div>}
  </section>;
}
