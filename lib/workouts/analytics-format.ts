// Display-only formatting. Values are rounded here and nowhere in the calculation path.
const number = (value: number, minimumFractionDigits: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat("ja-JP", { minimumFractionDigits, maximumFractionDigits }).format(value);

// e1RM: always one decimal ("80.0 kg").
export const formatE1rm = (kg: number) => `${number(kg, 1, 1)} kg`;
// Volume: thousands separators, decimals only when needed ("1,620 kg", "562.5 kg").
export const formatVolume = (kg: number) => `${number(kg, 0, 1)} kg`;

function signed(delta: number, minimumFractionDigits: number): string {
  const text = number(Math.abs(delta), minimumFractionDigits, 1);
  // A delta that rounds to zero is shown without a sign.
  if (Number(text.replaceAll(",", "")) === 0) return `${text} kg`;
  return `${delta > 0 ? "+" : "-"}${text} kg`;
}
export const formatE1rmDelta = (kg: number) => signed(kg, 1);
export const formatVolumeDelta = (kg: number) => signed(kg, 0);

// Chart date label ("9/24") in Asia/Tokyo, the app's display timezone. Display only; period filtering uses instants.
export const formatChartDate = (timestamp: number | string) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(timestamp));
