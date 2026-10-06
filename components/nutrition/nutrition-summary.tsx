import { formatGrams, formatKcal, progress } from "@/lib/nutrition/display";
import type { NutritionSummaryDTO, NutritionTargetDTO } from "@/lib/nutrition/types";

function Bar({ current, target, label }: { current: number | null; target: number | null; label: string }) {
  const p = progress(current, target);
  if (!p) return null;
  return <div role="progressbar" aria-label={`${label}の達成率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.ratio * 100)}
    className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
    <div className={`h-full rounded-full ${p.over ? "bg-sky-500" : "bg-orange-500"}`} style={{ width: `${p.ratio * 100}%` }} />
  </div>;
}

// Presentation only: summary and target come from the Phase 6C dashboard query; nothing is re-aggregated here.
export function NutritionSummary({ summary, target }: { summary: NutritionSummaryDTO; target: NutritionTargetDTO | null }) {
  const macros = [
    { label: "たんぱく質", short: "P", current: summary.proteinGrams, target: target?.targetProtein ?? null },
    { label: "脂質", short: "F", current: summary.fatGrams, target: target?.targetFat ?? null },
    { label: "炭水化物", short: "C", current: summary.carbsGrams, target: target?.targetCarbs ?? null },
  ];
  return <section aria-label="摂取状況" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-slate-500">摂取カロリー</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
      {formatKcal(summary.calories)}
      {target && <span className="text-base font-semibold text-slate-500"> / {formatKcal(target.targetCalories)}</span>}
    </p>
    <Bar current={summary.calories} target={target?.targetCalories ?? null} label="カロリー" />
    <dl className="mt-4 grid grid-cols-3 gap-2">
      {macros.map((m) => <div key={m.short} className="rounded-xl bg-slate-50 p-2.5">
        <dt className="text-xs font-semibold text-slate-500">{m.short}<span className="font-normal">（{m.label}）</span></dt>
        <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
          {formatGrams(m.current)}
          {m.target !== null && <span className="block text-xs font-medium text-slate-500">/ {formatGrams(m.target)}</span>}
        </dd>
        <Bar current={m.current} target={m.target} label={m.label} />
      </div>)}
    </dl>
  </section>;
}
