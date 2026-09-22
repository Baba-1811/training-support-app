"use client";
import { estimatedOneRepMax } from "@/lib/workouts/calculations";

export type Row = {
  key: string; id?: string; setNumber: number; weightKg: string; reps: string; rir: string;
  setType: "WORKING" | "WARMUP";
};
export function SetRow({ row, disabled, onChange, onSave, onDelete }: {
  row: Row; disabled: boolean; onChange: (row: Row) => void; onSave: () => void; onDelete: () => void;
}) {
  const estimate = row.weightKg.trim() && row.reps.trim() ? estimatedOneRepMax(Number(row.weightKg), Number(row.reps)) : null;
  return <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_2.5rem_2.5rem] items-end gap-2 border-t border-slate-200 py-3">
    <span className="pb-2 text-center text-sm tabular-nums">{row.setNumber}</span>
    <label className="grid min-w-0 gap-1 text-xs">重量 kg<input aria-label={`セット${row.setNumber} 重量`} inputMode="decimal" value={row.weightKg} disabled={disabled} onChange={(e) => onChange({ ...row, weightKg: e.target.value })} className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-base tabular-nums" /></label>
    <label className="grid min-w-0 gap-1 text-xs">回数<input aria-label={`セット${row.setNumber} 回数`} inputMode="numeric" value={row.reps} disabled={disabled} onChange={(e) => onChange({ ...row, reps: e.target.value })} className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-base tabular-nums" /></label>
    <label className="grid min-w-0 gap-1 text-xs">RIR<input aria-label={`セット${row.setNumber} RIR`} inputMode="decimal" value={row.rir} disabled={disabled} onChange={(e) => onChange({ ...row, rir: e.target.value })} className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-base tabular-nums" /></label>
    <button type="button" disabled={disabled} onClick={onSave} title={row.id ? "セットを更新" : "セットを確定"} aria-label={row.id ? "セットを更新" : "セットを確定"} className={`h-10 w-10 rounded text-lg disabled:opacity-50 ${row.id ? "border border-emerald-700 text-emerald-800" : "bg-emerald-700 text-white"}`}>✓</button>
    <button type="button" disabled={disabled} onClick={onDelete} title="セットを削除" aria-label="セットを削除" className="h-10 w-10 rounded border border-slate-300 text-xl text-red-700 disabled:opacity-50">×</button>
    <div className="col-start-2 col-end-7 flex flex-wrap items-center justify-between gap-2">
      <select aria-label={`セット${row.setNumber} 種別`} value={row.setType} disabled={disabled} onChange={(e) => onChange({ ...row, setType: e.target.value as Row["setType"] })} className="max-w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"><option value="WORKING">WORKING</option><option value="WARMUP">WARMUP</option></select>
      <span className="text-xs text-slate-600">{row.id ? "記録済み" : "未確定"} · e1RM {estimate === null ? "—" : `${estimate.toFixed(1)} kg`}</span>
    </div>
  </div>;
}
