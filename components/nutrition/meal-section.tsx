"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteNutritionEntry } from "@/app/(protected)/nutrition/actions";
import { MEAL_LABELS, formatKcal, formatMacros } from "@/lib/nutrition/display";
import type { MealType, NutritionEntryDTO } from "@/lib/nutrition/types";
import { EntryForm } from "./entry-form";

export function MealSection({ date, mealType, entries }: { date: string; mealType: MealType; entries: NutritionEntryDTO[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const label = MEAL_LABELS[mealType];
  const subtotal = entries.reduce((sum, entry) => sum + entry.calories, 0);

  const remove = async (entry: NutritionEntryDTO) => {
    if (deletingId || !window.confirm(`「${entry.name}」を削除します。よろしいですか？`)) return;
    setDeletingId(entry.id);
    setError("");
    try {
      const result = await deleteNutritionEntry({ id: entry.id });
      if (result.ok) router.refresh(); else setError(result.message);
    } catch {
      setError("削除できませんでした。再試行してください。");
    }
    setDeletingId(null);
  };

  return <section aria-labelledby={`meal-${mealType}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-baseline justify-between">
      <h2 id={`meal-${mealType}`} className="text-sm font-bold text-slate-900">{label}</h2>
      {entries.length > 0 && <p className="text-xs font-semibold tabular-nums text-slate-500">{formatKcal(subtotal)}</p>}
    </div>
    {entries.length === 0 && !adding && <p className="mt-2 text-sm text-slate-500">まだ記録がありません</p>}
    <ul className="mt-2 divide-y divide-slate-100">
      {entries.map((entry) => <li key={entry.id} className="py-2.5">
        {editingId === entry.id
          ? <EntryForm date={date} mealType={mealType} entry={entry} onDone={() => setEditingId(null)} />
          : <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">{entry.name}</p>
              <p className="mt-0.5 text-sm tabular-nums text-slate-700">{formatKcal(entry.calories)}</p>
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">{formatMacros(entry)}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" aria-label={`${entry.name}を編集`} disabled={deletingId !== null}
                onClick={() => { setAdding(false); setEditingId(entry.id); }}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">編集</button>
              <button type="button" aria-label={`${entry.name}を削除`} disabled={deletingId !== null} onClick={() => void remove(entry)}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-red-700 active:bg-red-50 disabled:opacity-50">
                {deletingId === entry.id ? "削除中…" : "削除"}
              </button>
            </div>
          </div>}
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {adding
      ? <div className="mt-2"><EntryForm date={date} mealType={mealType} onDone={() => setAdding(false)} /></div>
      : <button type="button" onClick={() => { setEditingId(null); setAdding(true); }}
        className="mt-2 min-h-11 w-full rounded-xl border border-orange-200 bg-orange-50 text-sm font-semibold text-orange-700 active:bg-orange-100">
        ＋ {label}を追加
      </button>}
  </section>;
}
