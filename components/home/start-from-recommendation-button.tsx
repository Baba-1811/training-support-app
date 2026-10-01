"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startWorkoutFromRecommendation } from "@/app/(protected)/workouts/actions";

// The only Client island on the Home Recommendation card (Phase 5D): everything else about the card is
// server-rendered, read-only data. Sends no Recommendation payload — the server re-derives everything itself
// (see createWorkoutFromRecommendation) — and disables itself while pending to guard against a double click
// creating two WorkoutPlan/WorkoutSession pairs from one tap (see lib/workouts/mutations.ts for the server-side
// limits of that protection).
export function StartFromRecommendationButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div className="mt-3">
    <button type="button" disabled={pending} onClick={async () => {
      if (pending) return;
      setPending(true); setError("");
      try {
        const result = await startWorkoutFromRecommendation({});
        if (result.ok) router.push(`/workouts/${result.data.sessionId}`);
        else { setError(result.message); setPending(false); }
      } catch { setError("開始できませんでした。再試行してください。"); setPending(false); }
    }} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50 active:bg-orange-600">
      {pending ? "開始中…" : "このメニューで始める"}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
