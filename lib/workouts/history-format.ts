// Display-only formatting for workout summaries (Asia/Tokyo, the app's display timezone).
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium" }).format(new Date(iso));
}
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", timeStyle: "short" }).format(new Date(iso));
}
export function formatDuration(startedAt: string, completedAt: string): string {
  const totalMinutes = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}
