"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startWorkout } from "@/app/(protected)/workouts/actions";

// `compact` (Home) drops the optional title field and uses the primary-CTA wording; the start logic is the same.
export function StartWorkoutForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <form className={compact ? "" : "mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"} onSubmit={async (event) => {
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
    {!compact && <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-600">タイトル（任意）
      <input name="title" maxLength={100} disabled={pending} placeholder="例：胸・肩の日"
        className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" />
    </label>}
    <button disabled={pending} className={`${compact ? "" : "mt-3 "}min-h-12 w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50 active:bg-orange-600`}>{pending ? "開始中…" : compact ? "トレーニングを始める" : "トレーニングを開始"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </form>;
}
