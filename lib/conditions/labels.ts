// Direction: higher number = more of the (bad) state, for both scales.
export const FATIGUE_LABELS: Readonly<Record<number, string>> = {
  1: "元気", 2: "少し疲れている", 3: "普通", 4: "疲れている", 5: "かなり疲れている",
};
export const SORENESS_LABELS: Readonly<Record<number, string>> = {
  1: "わずか", 2: "軽い", 3: "あり", 4: "強い", 5: "かなり強い",
};

export function fatigueLabel(level: number | null): string {
  return level === null ? "—" : (FATIGUE_LABELS[level] ?? String(level));
}
export function sorenessLabel(level: number): string {
  return SORENESS_LABELS[level] ?? String(level);
}
export function formatSleepHours(hours: string | null): string {
  return hours === null ? "—" : `${Number(hours).toFixed(1)}h`;
}
export function formatAvailableMinutes(minutes: number | null): string {
  return minutes === null ? "—" : `${minutes}分`;
}
