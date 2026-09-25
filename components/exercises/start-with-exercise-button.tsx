"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addExercise, startWorkoutWithExercise } from "@/app/(protected)/workouts/actions";
import { connectErrorMessage } from "@/lib/exercises/connect";

// Exercise detail -> workout. With no unfinished workout this starts one with this exercise already in it (one server
// call, so no empty workout can be left behind). With one, the exercise is added to it (the newest, chosen by the server
// page) so a second IN_PROGRESS workout is never created by accident. Only ids travel from here; the owner is resolved
// on the server. `currentWorkout.title` is display text for the label only.
export function StartWithExerciseButton({ exerciseId, currentWorkout }: {
  exerciseId: string; currentWorkout: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    if (pending) return;
    setPending(true); setError("");
    try {
      if (currentWorkout) {
        const result = await addExercise({ sessionId: currentWorkout.id, exerciseId });
        if (!result.ok) { setError(connectErrorMessage("add", result.code)); setPending(false); return; }
        router.push(`/workouts/${currentWorkout.id}`);
      } else {
        const result = await startWorkoutWithExercise({ exerciseId });
        if (!result.ok) { setError(connectErrorMessage("start", result.code)); setPending(false); return; }
        router.push(`/workouts/${result.data.sessionId}`);
      }
    } catch { setError("通信に失敗しました。時間をおいて再試行してください。"); setPending(false); }
  }
  return <div>
    <button type="button" onClick={connect} disabled={pending}
      className="min-h-12 w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50 active:bg-orange-600">
      {pending ? (currentWorkout ? "追加中…" : "開始中…") : currentWorkout ? "進行中のトレーニングに追加" : "この種目でトレーニング"}
    </button>
    {currentWorkout && <p className="mt-2 text-center text-xs text-slate-500">「{currentWorkout.title}」に追加します</p>}
    {error && <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
  </div>;
}
