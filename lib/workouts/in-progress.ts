export type InProgressWorkout = { id: string; title: string | null; startedAt: string };

// Several IN_PROGRESS workouts can already exist (nothing prevented starting a second one). The newest is the one to
// resume; the rest are listed but never deleted or completed automatically.
export function splitInProgress(workouts: readonly InProgressWorkout[]): { current: InProgressWorkout | null; others: InProgressWorkout[] } {
  const sorted = [...workouts].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return { current: sorted[0] ?? null, others: sorted.slice(1) };
}
