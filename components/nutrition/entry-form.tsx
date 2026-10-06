"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createNutritionEntry, updateNutritionEntry } from "@/app/(protected)/nutrition/actions";
import { MEAL_LABELS, MEAL_SECTIONS } from "@/lib/nutrition/display";
import type { MealType, NutritionEntryDTO } from "@/lib/nutrition/types";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 disabled:opacity-50";
const text = (value: number | null) => (value === null ? "" : String(value));

// One form for both add and edit. Fields are sent as raw text; the server action does the only validation.
export function EntryForm({ date, mealType, entry, onDone }: {
  date: string; mealType: MealType; entry?: NutritionEntryDTO; onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [meal, setMeal] = useState<MealType>(entry?.mealType ?? mealType);
  const [name, setName] = useState(entry?.name ?? "");
  const [calories, setCalories] = useState(entry ? String(entry.calories) : "");
  const [protein, setProtein] = useState(entry ? text(entry.proteinGrams) : "");
  const [fat, setFat] = useState(entry ? text(entry.fatGrams) : "");
  const [carbs, setCarbs] = useState(entry ? text(entry.carbsGrams) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setFieldErrors({});
    const fields = { mealType: meal, name, calories, proteinGrams: protein, fatGrams: fat, carbsGrams: carbs };
    try {
      const result = entry ? await updateNutritionEntry({ id: entry.id, ...fields }) : await createNutritionEntry({ entryDate: date, ...fields });
      if (result.ok) { router.refresh(); onDone(); return; }
      setError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
    } catch {
      setError("保存できませんでした。再試行してください。");
    }
    setPending(false);
  };

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

  return <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-slate-50 p-3">
    <div>
      <label htmlFor={`${uid}-name`} className="text-xs font-semibold text-slate-600">食品・料理名</label>
      <input id={`${uid}-name`} type="text" maxLength={100} autoComplete="off" value={name} disabled={pending}
        onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1`} {...invalid("name")} />
      {errorText("name")}
    </div>
    <div>
      <label htmlFor={`${uid}-calories`} className="text-xs font-semibold text-slate-600">カロリー（kcal）</label>
      <input id={`${uid}-calories`} type="text" inputMode="numeric" autoComplete="off" value={calories} disabled={pending}
        onChange={(e) => setCalories(e.target.value)} className={`${inputClass} mt-1`} {...invalid("calories")} />
      {errorText("calories")}
    </div>
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold text-slate-600">PFC（わかる場合だけ）</legend>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {macro("proteinGrams", "P", "たんぱく質g", protein, setProtein)}
        {macro("fatGrams", "F", "脂質g", fat, setFat)}
        {macro("carbsGrams", "C", "炭水化物g", carbs, setCarbs)}
      </div>
    </fieldset>
    <div>
      <label htmlFor={`${uid}-meal`} className="text-xs font-semibold text-slate-600">食事の種類</label>
      <select id={`${uid}-meal`} value={meal} disabled={pending} onChange={(e) => setMeal(e.target.value as MealType)} className={`${inputClass} mt-1`}>
        {MEAL_SECTIONS.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
      </select>
      {errorText("mealType")}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={pending} onClick={onDone}
        className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">キャンセル</button>
      <button type="submit" disabled={pending}
        className="min-h-12 rounded-xl bg-orange-500 text-base font-semibold text-white shadow-sm active:bg-orange-600 disabled:opacity-50">
        {pending ? "保存中…" : "保存"}
      </button>
    </div>
  </form>;
}
