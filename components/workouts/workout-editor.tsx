"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as actions from "@/app/(protected)/workouts/actions";
import { workoutTitle } from "@/lib/workouts/calculations";
import type { ActionResult, WorkoutDTO, SetDTO } from "@/lib/workouts/types";
import { SetRow, SetRowHeader, type Row } from "./set-row";

const savedRow = (set: SetDTO): Row => ({ key: `set-${set.id}`, id: set.id, setNumber: set.setNumber,
  weightKg: set.weightKg, reps: String(set.reps), rir: set.rir ?? "", setType: set.setType });
const blankRow = (number: number): Row => ({ key: `draft-${number}`, setNumber: number, weightKg: "", reps: "", rir: "", setType: "WORKING" });
function reconcile(workout: WorkoutDTO, previous: Record<string, Row[]> = {}): Record<string, Row[]> {
  return Object.fromEntries(workout.exercises.map((exercise) => {
    const before = previous[exercise.id];
    const rows = exercise.sets.map((set) => before?.find((row) => row.id === set.id) ?? savedRow(set));
    if (workout.status === "IN_PROGRESS") {
      const occupied = new Set(rows.map((row) => row.setNumber));
      const drafts = before?.filter((row) => !row.id && !occupied.has(row.setNumber));
      if (drafts) rows.push(...drafts);
      else {
        const maximum = Math.max(0, ...rows.map((row) => row.setNumber));
        for (let i = 1; i <= Math.max(1, 3 - exercise.sets.length); i++) rows.push(blankRow(maximum + i));
      }
    }
    return [exercise.id, rows.sort((a, b) => a.setNumber - b.setNumber)];
  }));
}

function StatusBadge({ status }: { status: WorkoutDTO["status"] }) {
  const style = {
    IN_PROGRESS: { label: "トレーニング中", className: "border-orange-200 bg-orange-50 text-orange-700" },
    COMPLETED: { label: "完了", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    CANCELLED: { label: "キャンセル済み", className: "border-slate-200 bg-slate-100 text-slate-500" },
  }[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${style.className}`}>{style.label}</span>;
}

function useElapsedLabel(startedAt: string, active: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const start = new Date(startedAt).getTime();
    const format = () => {
      const totalSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (value: number) => String(value).padStart(2, "0");
      return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
    };
    // Both ticks run inside callbacks (not synchronously in the effect body) so the
    // initial label is set just after mount instead of during SSR/hydration.
    const initial = setTimeout(() => setLabel(format()), 0);
    const timer = setInterval(() => setLabel(format()), 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [startedAt, active]);
  return label;
}

export function WorkoutEditor({ initialWorkout, availableExercises }: {
  initialWorkout: WorkoutDTO; availableExercises: Array<{ id: string; name: string }>;
}) {
  const [workout, setWorkout] = useState(initialWorkout);
  const [rows, setRows] = useState(() => reconcile(initialWorkout));
  const [title, setTitle] = useState(initialWorkout.title ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [exerciseId, setExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const editable = workout.status !== "CANCELLED";
  const active = workout.status === "IN_PROGRESS";
  const elapsedLabel = useElapsedLabel(workout.startedAt, active);
  async function run(operation: () => Promise<ActionResult<WorkoutDTO>>, onSuccess?: (data: WorkoutDTO, next: Record<string, Row[]>) => void) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = await operation();
      if (!result.ok) { setError([result.message, ...Object.values(result.fieldErrors ?? {}).flat()].join(" ")); return; }
      const next = reconcile(result.data, rows);
      onSuccess?.(result.data, next);
      setWorkout(result.data); setRows(next);
    } catch { setError("通信に失敗しました。入力を確認して再試行してください。"); }
    finally { setPending(false); }
  }
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 active:text-orange-600">← ホーム</Link>
    <fieldset disabled={pending || !editable} className="mt-3 min-w-0 space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <form className="flex items-center gap-1.5" onSubmit={(e) => {
                e.preventDefault();
                void run(() => actions.updateWorkoutTitle({ sessionId: workout.id, title }), () => setEditingTitle(false));
              }}>
                <input autoFocus value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} aria-label="ワークアウトタイトル"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" />
                <button className="h-10 shrink-0 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white active:bg-orange-600">保存</button>
                <button type="button" onClick={() => { setTitle(workout.title ?? ""); setEditingTitle(false); }}
                  className="h-10 shrink-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-500">戻す</button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditingTitle(true)} className="flex min-w-0 items-center gap-1.5 text-left">
                <h1 className="min-w-0 truncate text-xl font-bold text-slate-900">{workoutTitle(workout.title, workout.startedAt)}</h1>
                <span aria-hidden className="shrink-0 text-sm text-slate-300">✎</span>
              </button>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={workout.status} />
              {active && elapsedLabel && <span className="text-xs tabular-nums text-slate-400">⏱ {elapsedLabel}</span>}
            </div>
            {workout.completedAt && <p className="mt-2 text-xs text-slate-400">完了日時 {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(workout.completedAt))}</p>}
          </div>
          {active && <button type="button" className="shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 active:bg-orange-100" onClick={() => {
            if (window.confirm("トレーニングを終了します。未確定のセット入力は保存されません。よろしいですか？")) void run(() => actions.finishWorkout({ sessionId: workout.id }));
          }}>終了する</button>}
        </div>
      </div>

      {workout.exercises.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
        種目はまだありません。下から追加してください。
      </div>}
      {workout.exercises.map((exercise) => <section key={exercise.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{exercise.name}</h2>
            {exercise.muscles.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-400">対象：{exercise.muscles.join("・")}</p>}
          </div>
          <button type="button" aria-label={`${exercise.name}を削除`} title="種目を削除" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-slate-300 active:bg-red-50 active:text-red-600" onClick={() => {
            if (window.confirm(`${exercise.name}と配下の記録済みセットをすべて削除します。よろしいですか？`)) void run(() => actions.deleteWorkoutExercise({ workoutExerciseId: exercise.id }));
          }}>×</button>
        </div>
        {(rows[exercise.id] ?? []).length > 0 && <>
          <SetRowHeader />
          <details className="mb-1 px-0.5 text-[11px] text-slate-400">
            <summary className="cursor-pointer list-none text-orange-500 underline decoration-dotted underline-offset-2">RIRって？</summary>
            <p className="mt-1 leading-snug text-slate-500">「あと何回できそうだったか」を入力します。0＝限界まで追い込んだ、2＝あと2回できた、という意味です。</p>
          </details>
        </>}
        {(rows[exercise.id] ?? []).map((row) => <SetRow key={row.key} row={row} disabled={pending || !editable} onChange={(changed) => setRows({ ...rows, [exercise.id]: rows[exercise.id].map((item) => item.key === row.key ? changed : item) })}
          onSave={() => {
            const values = { weightKg: row.weightKg, reps: row.reps, rir: row.rir, setType: row.setType };
            void run(() => row.id ? actions.updateSet({ setId: row.id, ...values }) : actions.createSet({ workoutExerciseId: exercise.id, setNumber: row.setNumber, ...values }), (data, next) => {
              const saved = data.exercises.find((item) => item.id === exercise.id)?.sets.find((set) => set.setNumber === row.setNumber);
              if (saved) next[exercise.id] = next[exercise.id].map((item) => item.setNumber === row.setNumber ? savedRow(saved) : item);
              if (!row.id && data.status === "IN_PROGRESS") {
                let following = next[exercise.id].find((item) => !item.id && item.setNumber > row.setNumber);
                if (!following) { following = blankRow(Math.max(row.setNumber, ...next[exercise.id].map((item) => item.setNumber)) + 1); next[exercise.id].push(following); }
                if (!following.weightKg.trim()) following.weightKg = row.weightKg;
              }
            });
          }} onDelete={() => {
            if (row.id) void run(() => actions.deleteSet({ setId: row.id }));
            else setRows({ ...rows, [exercise.id]: rows[exercise.id].filter((item) => item.key !== row.key) });
          }} />)}
        {active && <button type="button" className="mt-2 w-full rounded-xl border border-dashed border-orange-200 py-2.5 text-sm font-medium text-orange-600 active:bg-orange-50" onClick={() => setRows({ ...rows, [exercise.id]: [...rows[exercise.id], blankRow(Math.max(0, ...rows[exercise.id].map((row) => row.setNumber)) + 1)] })}>＋ セットを追加</button>}
      </section>)}

      {active && <form className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" onSubmit={(e) => { e.preventDefault(); void run(() => actions.addExercise({ sessionId: workout.id, exerciseId })); }}>
        <select aria-label="追加する種目" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{availableExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select>
        <button disabled={!exerciseId || pending} className="shrink-0 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-orange-600">追加</button>
      </form>}
    </fieldset>
    {pending && <p role="status" className="mt-3 text-center text-xs text-slate-400">保存中…</p>}
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
  </main>;
}
