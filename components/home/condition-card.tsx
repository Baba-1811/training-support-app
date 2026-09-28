import Link from "next/link";
import { fatigueLabel, formatAvailableMinutes, formatSleepHours } from "@/lib/conditions/labels";
import { categoryLabel, type CategorySlug } from "@/lib/exercises/categories";
import type { DailyConditionDTO } from "@/lib/conditions/types";

// Home "今日のコンディション" card. Unfilled: one CTA to /condition. Filled: a compact, UI-category-only summary
// (never the individual Muscle names) with an 編集 link, so the card stays short whether or not Condition is used.
export function ConditionCard({ condition }: { condition: DailyConditionDTO | null }) {
  if (!condition) {
    return <section aria-labelledby="condition-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="condition-heading" className="text-base font-bold text-slate-900">今日のコンディション</h2>
      <p className="mt-1 text-sm text-slate-500">今日の状態を入力して、トレーニングの準備をしましょう。</p>
      <Link href="/condition" className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm active:bg-orange-600">
        コンディションを入力
      </Link>
    </section>;
  }
  const categories = Object.keys(condition.sorenessByCategory) as CategorySlug[];
  const sorenessSummary = categories.length === 0 ? "なし" : categories.map(categoryLabel).join("・");
  return <section aria-labelledby="condition-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h2 id="condition-heading" className="text-base font-bold text-slate-900">今日のコンディション</h2>
      <Link href="/condition" className="shrink-0 text-sm font-semibold text-orange-600 active:text-orange-700">編集</Link>
    </div>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-slate-600">
      <div className="flex justify-between gap-2"><dt>睡眠</dt><dd className="font-semibold text-slate-900">{formatSleepHours(condition.sleepHours)}</dd></div>
      <div className="flex justify-between gap-2"><dt>疲労</dt><dd className="font-semibold text-slate-900">{fatigueLabel(condition.fatigueLevel)}</dd></div>
      <div className="col-span-2 flex justify-between gap-2"><dt>筋肉痛</dt><dd className="font-semibold text-slate-900">{sorenessSummary}</dd></div>
      <div className="flex justify-between gap-2"><dt>使える時間</dt><dd className="font-semibold text-slate-900">{formatAvailableMinutes(condition.availableMinutes)}</dd></div>
    </dl>
  </section>;
}
