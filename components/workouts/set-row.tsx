"use client";
import { estimatedOneRepMax } from "@/lib/workouts/calculations";

export type Row = {
  key: string; id?: string; setNumber: number; weightKg: string; reps: string; rir: string;
  setType: "WORKING" | "WARMUP";
};

const ROW_COLUMNS = "grid-cols-[1.5rem_1fr_1fr_1fr_2.75rem]";

export function SetRowHeader() {
  return <div className={`grid ${ROW_COLUMNS} gap-1.5 px-0.5 text-[10px] font-semibold tracking-wide text-slate-400`}>
    <span className="text-center">SET</span>
    <span className="text-center">kg</span>
    <span className="text-center">回数</span>
    <span className="text-center">RIR</span>
    <span />
  </div>;
}

function SetTypeToggle({ value, disabled, onChange }: {
  value: Row["setType"]; disabled: boolean; onChange: (value: Row["setType"]) => void;
}) {
  const options: Array<{ value: Row["setType"]; label: string }> = [
    { value: "WORKING", label: "通常" }, { value: "WARMUP", label: "アップ" },
  ];
  return <div role="group" aria-label="セット種別" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
    {options.map((option) => <button key={option.value} type="button" disabled={disabled} aria-pressed={value === option.value}
      onClick={() => onChange(option.value)}
      className={`rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${value === option.value ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"}`}>
      {option.label}
    </button>)}
  </div>;
}

export function SetRow({ row, disabled, onChange, onSave, onDelete }: {
  row: Row; disabled: boolean; onChange: (row: Row) => void; onSave: () => void; onDelete: () => void;
}) {
  const estimate = row.weightKg.trim() && row.reps.trim() ? estimatedOneRepMax(Number(row.weightKg), Number(row.reps)) : null;
  const saved = Boolean(row.id);
  return <div className="border-t border-slate-100 py-2.5 first:border-t-0">
    <div className={`grid ${ROW_COLUMNS} items-center gap-1.5`}>
      <span className="text-center text-sm font-semibold tabular-nums text-slate-400">{row.setNumber}</span>
      <input aria-label={`セット${row.setNumber} 重量(kg)`} inputMode="decimal" placeholder="kg" value={row.weightKg} disabled={disabled}
        onChange={(e) => onChange({ ...row, weightKg: e.target.value })}
        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-1 py-2.5 text-center text-base tabular-nums focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" />
      <input aria-label={`セット${row.setNumber} 回数`} inputMode="numeric" placeholder="回" value={row.reps} disabled={disabled}
        onChange={(e) => onChange({ ...row, reps: e.target.value })}
        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-1 py-2.5 text-center text-base tabular-nums focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" />
      <input aria-label={`セット${row.setNumber} RIR`} inputMode="decimal" placeholder="RIR" value={row.rir} disabled={disabled}
        onChange={(e) => onChange({ ...row, rir: e.target.value })}
        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-1 py-2.5 text-center text-base tabular-nums focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" />
      <button type="button" disabled={disabled} onClick={onSave} title={saved ? "セットを更新" : "セットを確定"} aria-label={saved ? "セットを更新" : "セットを確定"}
        className={`flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold disabled:opacity-40 ${saved ? "border border-orange-300 bg-orange-50 text-orange-600" : "bg-orange-500 text-white active:bg-orange-600"}`}>
        ✓
      </button>
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-2 pl-[1.875rem]">
      <div className="flex min-w-0 items-center gap-2">
        <SetTypeToggle value={row.setType} disabled={disabled} onChange={(setType) => onChange({ ...row, setType })} />
        <span className="truncate text-[11px] text-slate-400">{saved ? "記録済み" : "未確定"} · e1RM {estimate === null ? "—" : `${estimate.toFixed(1)}kg`}</span>
      </div>
      <button type="button" disabled={disabled} onClick={onDelete} aria-label="セットを削除" title="セットを削除"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-slate-300 disabled:opacity-40 active:bg-red-50 active:text-red-600">
        ×
      </button>
    </div>
  </div>;
}
