"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChartDate } from "@/lib/workouts/analytics-format";

type ChartPoint = { t: number; value: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const axisNumber = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

// Line chart on a real time axis (workouts are plotted where they happened; same-day workouts stay separate points).
// Numbers are passed through unrounded; `formatValue` only affects display. Recharts' tooltip follows touch as well as hover.
export function TrendChart({ title, points, color, formatValue }: {
  title: string; points: ChartPoint[]; color: string; formatValue: (value: number) => string;
}) {
  const first = points[0].t;
  const last = points[points.length - 1].t;
  // Pad the ends so the first/last points are not clipped against the axes (at least half a day).
  const pad = Math.max((last - first) * 0.05, DAY_MS / 2);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
    <div className="mt-3 h-52 w-full" role="img" aria-label={`${title}の推移グラフ`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={[first - pad, last + pad]} tickCount={4}
            tickFormatter={formatChartDate} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
          <YAxis width={48} domain={["auto", "auto"]} tickCount={4} tickFormatter={(value: number) => axisNumber.format(value)}
            tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ stroke: "#cbd5e1" }} content={({ active, payload }) => {
            const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
            if (!point) return null;
            return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
              <p className="text-slate-500">{formatChartDate(point.t)}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatValue(point.value)}</p>
            </div>;
          }} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} isAnimationActive={false}
            dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
