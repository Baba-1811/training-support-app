"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyCaloriesPoint } from "@/lib/nutrition/analytics";

const label = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// Days with nothing logged have calories null -> no bar (not a 0 kcal bar).
export function CaloriesChart({ daily }: { daily: DailyCaloriesPoint[] }) {
  return <div className="mt-3 h-48 w-full" role="img" aria-label="直近7日の摂取カロリーの棒グラフ">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={label} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
        <YAxis width={48} domain={[0, "auto"]} tickCount={4} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => {
          const point = active ? (payload?.[0]?.payload as DailyCaloriesPoint | undefined) : undefined;
          if (!point) return null;
          return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
            <p className="text-slate-500">{label(point.date)}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
              {point.calories === null ? "記録なし" : `${point.calories.toLocaleString("en-US")} kcal`}
            </p>
          </div>;
        }} />
        <Bar dataKey="calories" fill="#FF6B00" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
