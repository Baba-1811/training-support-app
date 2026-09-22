"use client";
import Link from "next/link";
import { useState } from "react";
import * as actions from "@/app/(protected)/workouts/actions";
import { workoutTitle } from "@/lib/workouts/calculations";
import type { ActionResult, WorkoutDTO, SetDTO } from "@/lib/workouts/types";
import { SetRow, type Row } from "./set-row";

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
export function WorkoutEditor({ initialWorkout, availableExercises }: {
  initialWorkout: WorkoutDTO; availableExercises: Array<{ id: string; name: string }>;
}) {
  const [workout, setWorkout] = useState(initialWorkout);
  const [rows, setRows] = useState(() => reconcile(initialWorkout));
  const [title, setTitle] = useState(initialWorkout.title ?? "");
  const [exerciseId, setExerciseId] = useState(availableExercises[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const editable = workout.status !== "CANCELLED";
  const active = workout.status === "IN_PROGRESS";
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
  return <main className="mx-auto w-full max-w-3xl px-3 py-6 text-slate-900 sm:px-6">
    <Link href="/" className="text-sm text-emerald-800 underline">ホーム</Link>
    <div className="my-5 flex flex-wrap items-start justify-between gap-3">
      <h1 className="min-w-0 break-words text-2xl font-semibold">{workoutTitle(workout.title, workout.startedAt)}</h1>
      <span className="text-sm text-slate-600">{active ? "トレーニング中" : workout.status === "COMPLETED" ? "完了" : "キャンセル済み"}</span>
    </div>
    {workout.completedAt && <p className="mb-4 text-sm text-slate-600">完了日時 {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(workout.completedAt))}</p>}
    <fieldset disabled={pending || !editable} className="min-w-0">
      <form className="mb-6 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => actions.updateWorkoutTitle({ sessionId: workout.id, title })); }}>
        <label className="grid min-w-0 flex-1 gap-1 text-sm">タイトル<input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className="min-w-0 rounded border border-slate-300 bg-white px-3 py-2" /></label>
        <button className="rounded border border-slate-300 bg-white px-3 py-2">保存</button>
      </form>
      {workout.exercises.length === 0 && <p className="py-6 text-sm text-slate-500">種目はまだありません。</p>}
      {workout.exercises.map((exercise) => <section key={exercise.id} className="mb-6 border-b border-slate-300 pb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="min-w-0 break-words text-lg font-semibold">{exercise.name}</h2>
          <button type="button" aria-label={`${exercise.name}を削除`} title="種目を削除" className="h-10 w-10 shrink-0 rounded border border-slate-300 text-xl text-red-700" onClick={() => {
            if (window.confirm(`${exercise.name}と配下の記録済みセットをすべて削除します。よろしいですか？`)) void run(() => actions.deleteWorkoutExercise({ workoutExerciseId: exercise.id }));
          }}>×</button>
        </div>
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
        {active && <button type="button" className="mt-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => setRows({ ...rows, [exercise.id]: [...rows[exercise.id], blankRow(Math.max(0, ...rows[exercise.id].map((row) => row.setNumber)) + 1)] })}>＋ セット追加</button>}
      </section>)}
      {active && <form className="my-6 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => actions.addExercise({ sessionId: workout.id, exerciseId })); }}>
        <select aria-label="追加する種目" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2">{availableExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select>
        <button disabled={!exerciseId || pending} className="rounded border border-emerald-700 px-4 py-2 text-emerald-800 disabled:opacity-50">種目を追加</button>
      </form>}
      {active && <button type="button" className="w-full rounded bg-emerald-700 px-4 py-3 text-white disabled:opacity-50" onClick={() => {
        if (window.confirm("トレーニングを終了します。未確定のセット入力は保存されません。よろしいですか？")) void run(() => actions.finishWorkout({ sessionId: workout.id }));
      }}>トレーニングを終了</button>}
    </fieldset>
    {pending && <p role="status" className="mt-3 text-sm">保存中…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </main>;
}
