import Link from "next/link";
import { formatKcal } from "@/lib/nutrition/display";
import type { NutritionHomeDTO } from "@/lib/nutrition/types";

// Home "今日の食事" card: today's calories (with the target in effect today, if any), the number of logged items and
// today's weight. Entry and charts live on /nutrition and /nutrition/analytics; nothing is entered or plotted here.
export function NutritionCard({ nutrition }: { nutrition: NutritionHomeDTO }) {
  const { entryCount, calories, targetCalories, weight } = nutrition;
  return <section aria-labelledby="nutrition-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h2 id="nutrition-heading" className="text-base font-bold text-slate-900">今日の食事</h2>
      <Link href="/nutrition/analytics" className="shrink-0 text-sm font-semibold text-sky-600 active:text-sky-700">推移を見る</Link>
    </div>
    {entryCount === 0
      ? <p className="mt-1 text-sm text-slate-500">今日の食事はまだ記録されていません</p>
      : <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
        {formatKcal(calories)}
        {targetCalories !== null && targetCalories > 0 && <span className="text-base font-semibold text-slate-500"> / {formatKcal(targetCalories)}</span>}
      </p>}
    <dl className="mt-2 grid grid-cols-2 gap-x-3 text-sm text-slate-600">
      <div className="flex justify-between gap-2"><dt>記録</dt><dd className="font-semibold text-slate-900">{entryCount}件</dd></div>
      <div className="flex justify-between gap-2"><dt>今日の体重</dt><dd className="font-semibold text-slate-900">{weight ? `${weight.weightKg} kg` : "未記録"}</dd></div>
    </dl>
    <Link href="/nutrition" className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-orange-500 bg-white px-4 py-3 text-base font-semibold text-orange-600 active:bg-orange-50">
      食事を記録
    </Link>
  </section>;
}
