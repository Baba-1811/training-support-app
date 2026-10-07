"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createBodyMeasurement } from "@/app/(protected)/nutrition/actions";
import type { BodyWeightDTO } from "@/lib/nutrition/types";

const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 disabled:opacity-50";

// Shows the day's weight from the Phase 6C dashboard query (no re-selection here). Saving ALWAYS inserts a new
// BodyMeasurement for the viewed JST day; the existing value only pre-fills the form and is never modified.
export function WeightSection({ date, weight }: { date: string; weight: BodyWeightDTO | null }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [weightKg, setWeightKg] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const openForm = () => {
    setWeightKg(weight ? String(weight.weightKg) : "");
    setBodyFat(weight?.bodyFatPercent != null ? String(weight.bodyFatPercent) : "");
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
      const result = await createBodyMeasurement({ date, weightKg, bodyFatPercent: bodyFat });
      if (result.ok) { router.refresh(); setOpen(false); setPending(false); return; }
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

  return <section aria-label="体重" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-sm font-bold text-slate-900">体重</h2>
    {weight ? <dl className="mt-2 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-slate-50 p-2.5">
        <dt className="text-xs font-semibold text-slate-500">体重</dt>
        <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{weight.weightKg} kg</dd>
      </div>
      <div className="rounded-xl bg-slate-50 p-2.5">
        <dt className="text-xs font-semibold text-slate-500">体脂肪率</dt>
        <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{weight.bodyFatPercent === null ? "—" : `${weight.bodyFatPercent} %`}</dd>
      </div>
    </dl> : <p className="mt-1 text-sm text-slate-500">この日の体重はまだ記録されていません</p>}
    {!open ? <button type="button" onClick={openForm}
      className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50">
      {weight ? "新しい体重を記録" : "体重を記録"}
    </button> : <form onSubmit={handleSubmit} aria-label="体重の記録" className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">{date.replaceAll("-", "/")} の記録として追加します。以前の記録は残ります。</p>
      <div>
        <label htmlFor={`${uid}-weightKg`} className="text-xs font-semibold text-slate-600">体重（kg）<span className="font-normal text-slate-400"> 必須</span></label>
        <input id={`${uid}-weightKg`} type="text" inputMode="decimal" autoComplete="off" value={weightKg} disabled={pending}
          onChange={(e) => setWeightKg(e.target.value)} placeholder="65.4" className={`${inputClass} mt-1`} {...invalid("weightKg")} />
        {errorText("weightKg")}
      </div>
      <div>
        <label htmlFor={`${uid}-bodyFat`} className="text-xs font-semibold text-slate-600">体脂肪率（%）<span className="font-normal text-slate-400"> 任意</span></label>
        <input id={`${uid}-bodyFat`} type="text" inputMode="decimal" autoComplete="off" value={bodyFat} disabled={pending}
          onChange={(e) => setBodyFat(e.target.value)} placeholder="15.2" className={`${inputClass} mt-1`} {...invalid("bodyFatPercent")} />
        {errorText("bodyFatPercent")}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => setOpen(false)}
          className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50">キャンセル</button>
        <button type="submit" disabled={pending}
          className="min-h-12 rounded-xl bg-orange-500 text-base font-semibold text-white shadow-sm active:bg-orange-600 disabled:opacity-50">
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </form>}
  </section>;
}
