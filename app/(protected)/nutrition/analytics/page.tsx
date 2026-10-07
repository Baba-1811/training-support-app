import Link from "next/link";
import { getNutritionAnalytics } from "@/lib/nutrition/analytics-queries";
import { formatKcal } from "@/lib/nutrition/display";
import { TrendChart } from "@/components/analytics/trend-chart";
import { CaloriesChart } from "@/components/nutrition/calories-chart";

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const kg = (value: number) => `${value} kg`;
// Neutral wording and no colour coding: weight going up or down is not "good" or "bad" (e.g. when building muscle).
const signedKg = (value: number) => (value === 0 ? "±0.0 kg" : `${value > 0 ? "+" : "−"}${Math.abs(value)} kg`);

export default async function NutritionAnalyticsPage() {
  const { weight, nutrition } = await getNutritionAnalytics();
  return <main className="mx-auto w-full max-w-[480px] space-y-4 px-4 py-5 text-slate-900">
    <div>
      <Link href="/nutrition" className="text-sm font-semibold text-sky-600">← 食事に戻る</Link>
      <h1 className="mt-2 text-xl font-bold">推移</h1>
    </div>

    <section aria-label="体重の推移" className={card}>
      <h2 className="text-sm font-bold text-slate-900">体重（過去{weight.days}日）</h2>
      {weight.measurementDays === 0 ? <p className="mt-2 text-sm text-slate-500">まだ体重記録がありません</p> : <>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <dt className="text-xs font-semibold text-slate-500">最新</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums">{kg(weight.latest!.weightKg)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <dt className="text-xs font-semibold text-slate-500">期間の変化</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums">{weight.changeKg === null ? "—" : signedKg(weight.changeKg)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <dt className="text-xs font-semibold text-slate-500">記録日数</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums">{weight.measurementDays}日</dd>
          </div>
        </dl>
        {weight.changeKg === null
          ? <p className="mt-3 text-sm text-slate-500">比較するにはもう1日分の記録が必要です</p>
          : <p className="mt-3 text-xs text-slate-500">{weight.first!.date.replaceAll("-", "/")} の {kg(weight.first!.weightKg)} から {weight.latest!.date.replaceAll("-", "/")} の {kg(weight.latest!.weightKg)} への変化です。1日に複数回記録した日は最新の1件を使っています。</p>}
        {weight.latestBodyFat && <p className="mt-2 text-xs text-slate-500">最新の体脂肪率: {weight.latestBodyFat.percent} %（{weight.latestBodyFat.date.replaceAll("-", "/")}）</p>}
      </>}
      {weight.measurementDays >= 2 && <div className="mt-3">
        <TrendChart title="体重 (kg)" color="#0EA5E9" points={weight.points.map((p) => ({ t: p.t, value: p.weightKg }))} formatValue={kg} />
      </div>}
    </section>

    <section aria-label="摂取カロリーの推移" className={card}>
      <h2 className="text-sm font-bold text-slate-900">摂取カロリー（直近{nutrition.days}日）</h2>
      {nutrition.loggedDays === 0 ? <p className="mt-2 text-sm text-slate-500">まだ食事の記録がありません</p> : <>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <dt className="text-xs font-semibold text-slate-500">記録した日数</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums">{nutrition.loggedDays} / {nutrition.days}日</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <dt className="text-xs font-semibold text-slate-500">記録日の平均</dt>
            <dd className="mt-0.5 text-base font-bold tabular-nums">{formatKcal(nutrition.averageCalories!)}</dd>
          </div>
        </dl>
        <CaloriesChart daily={nutrition.daily} />
        <p className="mt-2 text-xs text-slate-500">記録のない日は棒を表示せず、平均にも含めません。</p>
      </>}
    </section>
  </main>;
}
