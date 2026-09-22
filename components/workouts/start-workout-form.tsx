"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startWorkout } from "@/app/(protected)/workouts/actions";

export function StartWorkoutForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <form className="mb-8 flex max-w-xl flex-wrap items-end gap-3 border-b border-slate-200 pb-6" onSubmit={async (event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await startWorkout({ title: data.get("title") });
      if (result.ok) router.push(`/workouts/${result.data.sessionId}`);
      else { setError(result.message); setPending(false); }
    } catch { setError("開始できませんでした。再試行してください。"); setPending(false); }
  }}>
    <label className="grid min-w-0 flex-1 gap-1 text-sm">タイトル（任意）
      <input name="title" maxLength={100} disabled={pending} className="min-w-0 rounded border border-slate-300 bg-white px-3 py-2" />
    </label>
    <button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">{pending ? "開始中…" : "トレーニングを開始"}</button>
    {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
  </form>;
}
