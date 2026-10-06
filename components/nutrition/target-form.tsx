"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createNutritionTarget } from "@/app/(protected)/nutrition/actions";
import type { NutritionTargetDTO } from "@/lib/nutrition/types";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 disabled:opacity-50";
const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

// Saving ALWAYS inserts a new NutritionTarget effective from `date` (the day being viewed); the current target only
// pre-fills the form and is never modified, so earlier days keep the target that applied to them.
export function TargetForm({ date, target }: { date: string; target: NutritionTargetDTO | null }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [calories, setCalories] = useState(text(target?.targetCalories));
  const [protein, setProtein] = useState(text(target?.targetProtein));
  const [fat, setFat] = useState(text(target?.targetFat));
  const [carbs, setCarbs] = useState(text(target?.targetCarbs));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const openForm = () => {
    setCalories(text(target?.targetCalories)); setProtein(text(target?.targetProtein));
    setFat(text(target?.targetFat)); setCarbs(text(target?.targetCarbs));
    setError(""); setFieldErrors({});
    setOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setFieldErrors({});
    try {
      const result = await createNutritionTarget({
        effectiveFrom: date, targetCalories: calories, targetProtein: protein, targetFat: fat, targetCarbs: carbs,
      });
      if (result.ok) { router.refresh(); setOpen(false); setPending(false); return; }
      setError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
    } catch {
      setError("保存できませんでした。再試行してください。");
    }
    setPending(false);
  };

  if (!open) return <button type="button" onClick={openForm}
    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50">
    {target ? "目標を変更" : "目標を設定"}
  </button>;

  const errorId = (field: string) => `${uid}-${field}-error`;
  const fieldError = (field: string) => fieldErrors[field]?.[0];
  const invalid = (field: string) => ({
    "aria-invalid": fieldError(field) ? true : undefined,
    "aria-describedby": fieldError(field) ? errorId(field) : undefined,
  });
  const errorText = (field: string) => fieldError(field) && <p id={errorId(field)} className="mt-1 text-xs text-red-700">{fieldError(field)}</p>;
  const macro = (field: string, label: string, short: string, value: string, set: (v: string) => void) => <div>
    <label htmlFor={`${uid}-${field}`} className="text-xs font-semibold text-slate-600">{label}<span className="font-normal text-slate-400">（{short}）</span></label>
    <input id={`${uid}-${field}`} type="text" inputMode="decimal" autoComplete="off" value={value} disabled={pending}
      onChange={(e) => set(e.target.value)} placeholder="任意" className={`${inputClass} mt-1`} {...invalid(field)} />
    {errorText(field)}
  </div>;

  return <form onSubmit={handleSubmit} aria-label="栄養目標の設定" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-sm font-bold text-slate-900">1日の目標</h2>
    <p className="text-xs text-slate-500">{date} からこの目標を適用します。それより前の日の目標は変わりません。</p>
    <div>
      <label htmlFor={`${uid}-calories`} className="text-xs font-semibold text-slate-600">目標カロリー（kcal）<span className="font-normal text-slate-400"> 必須</span></label>
      <input id={`${uid}-calories`} type="text" inputMode="numeric" autoComplete="off" value={calories} disabled={pending}
        onChange={(e) => setCalories(e.target.value)} className={`${inputClass} mt-1`} {...invalid("targetCalories")} />
      {errorText("targetCalories")}
    </div>
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold text-slate-600">PFC目標（わかる場合だけ）</legend>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {macro("targetProtein", "P", "たんぱく質g", protein, setProtein)}
        {macro("targetFat", "F", "脂質g", fat, setFat)}
        {macro("targetCarbs", "C", "炭水化物g", carbs, setCarbs)}
      </div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={pending} onClick={() => setOpen(false)}
        className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">キャンセル</button>
      <button type="submit" disabled={pending}
        className="min-h-12 rounded-xl bg-orange-500 text-base font-semibold text-white shadow-sm active:bg-orange-600 disabled:opacity-50">
        {pending ? "保存中…" : "保存"}
      </button>
    </div>
  </form>;
}
