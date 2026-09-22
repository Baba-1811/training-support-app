export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg < 0 || !Number.isSafeInteger(reps) || reps < 1) return null;
  const value = weightKg * (1 + reps / 30);
  return Number.isFinite(value) ? value : null;
}

export function workoutTitle(title: string | null, startedAt: string): string {
  if (title !== null) return title;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  }).formatToParts(new Date(startedAt));
  const month = parts.find((part) => part.type === "month")!.value;
  const day = parts.find((part) => part.type === "day")!.value;
  return `${month}月${day}日のトレーニング`;
}
