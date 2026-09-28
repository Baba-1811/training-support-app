"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDailyCondition } from "@/app/(protected)/condition/actions";
import { AVAILABLE_MINUTES } from "@/lib/conditions/validation";
import { FATIGUE_LABELS, SORENESS_LABELS } from "@/lib/conditions/labels";
import { SORENESS_CATEGORIES, categoryImage, categoryLabel, type CategorySlug } from "@/lib/exercises/categories";
import type { DailyConditionDTO } from "@/lib/conditions/types";

const FATIGUE_LEVELS = [1, 2, 3, 4, 5] as const;
const SORENESS_LEVELS = [1, 2, 3, 4, 5] as const;
const MIN_SLEEP_HOURS = 0;
const MAX_SLEEP_HOURS = 24;

function clampSleepHours(value: number): number {
  return Math.min(MAX_SLEEP_HOURS, Math.max(MIN_SLEEP_HOURS, Math.round(value * 2) / 2));
}

export function ConditionForm({ initial }: { initial: DailyConditionDTO | null }) {
  const router = useRouter();
  const [sleepHours, setSleepHours] = useState(() => initial?.sleepHours !== null && initial?.sleepHours !== undefined ? Number(initial.sleepHours) : 7);
  const [fatigueLevel, setFatigueLevel] = useState(initial?.fatigueLevel ?? 3);
  const [availableMinutes, setAvailableMinutes] = useState(initial?.availableMinutes ?? 60);
  const [soreness, setSoreness] = useState<Partial<Record<CategorySlug, number>>>(initial?.sorenessByCategory ?? {});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggleCategory = (slug: CategorySlug) => setSoreness((previous) => {
    if (previous[slug] === undefined) return { ...previous, [slug]: 3 };
    const next = { ...previous };
    delete next[slug];
    return next;
  });
  const setCategoryLevel = (slug: CategorySlug, level: number) => setSoreness((previous) => ({ ...previous, [slug]: level }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await saveDailyCondition({
        sleepHours, fatigueLevel, availableMinutes,
        soreness: Object.entries(soreness).map(([category, sorenessLevel]) => ({ category, sorenessLevel })),
      });
      if (result.ok) router.push("/");
      else { setError(result.message); setPending(false); }
    } catch {
      setError("保存できませんでした。再試行してください。");
      setPending(false);
    }
  };

  return <form onSubmit={handleSubmit} className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">睡眠時間</h2>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button type="button" aria-label="睡眠時間を減らす" disabled={pending}
          onClick={() => setSleepHours((value) => clampSleepHours(value - 0.5))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-600 active:bg-slate-50 disabled:opacity-50">
          −
        </button>
        <p className="min-w-[6rem] text-center text-2xl font-bold tabular-nums text-slate-900">{sleepHours.toFixed(1)}<span className="text-base font-semibold text-slate-500">時間</span></p>
        <button type="button" aria-label="睡眠時間を増やす" disabled={pending}
          onClick={() => setSleepHours((value) => clampSleepHours(value + 0.5))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-600 active:bg-slate-50 disabled:opacity-50">
          ＋
        </button>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">疲労</h2>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {FATIGUE_LEVELS.map((level) => <button key={level} type="button" disabled={pending}
          onClick={() => setFatigueLevel(level)}
          aria-pressed={fatigueLevel === level}
          className={`min-h-11 rounded-xl text-base font-bold disabled:opacity-50 ${fatigueLevel === level
            ? "bg-orange-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 active:bg-slate-50"}`}>
          {level}
        </button>)}
      </div>
      <p className="mt-2 text-center text-sm font-semibold text-slate-600">{FATIGUE_LABELS[fatigueLevel]}</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">筋肉痛</h2>
      <p className="mt-0.5 text-xs text-slate-500">ある部位だけタップしてください。</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {SORENESS_CATEGORIES.map((slug) => {
          const isSelected = soreness[slug] !== undefined;
          return <li key={slug}>
            <button type="button" disabled={pending} onClick={() => toggleCategory(slug)}
              aria-pressed={isSelected}
              className={`flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1 rounded-xl border p-1.5 disabled:opacity-50 ${isSelected
                ? "border-orange-500 bg-orange-500 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"}`}>
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                <Image src={categoryImage(slug)} alt="" fill sizes="36px" className="object-cover" />
              </span>
              <span className="text-xs font-semibold leading-none">{categoryLabel(slug)}</span>
            </button>
          </li>;
        })}
      </ul>
      {SORENESS_CATEGORIES.filter((slug) => soreness[slug] !== undefined).length > 0 && <div className="mt-3 space-y-2">
        {SORENESS_CATEGORIES.filter((slug) => soreness[slug] !== undefined).map((slug) => {
          const level = soreness[slug]!;
          return <div key={slug} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{categoryLabel(slug)}</p>
              <p className="text-xs text-slate-500">{SORENESS_LABELS[level]}</p>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {SORENESS_LEVELS.map((value) => <button key={value} type="button" disabled={pending}
                onClick={() => setCategoryLevel(slug, value)}
                aria-pressed={level === value}
                className={`min-h-10 rounded-lg text-sm font-semibold disabled:opacity-50 ${level === value
                  ? "bg-orange-500 text-white" : "border border-slate-200 bg-white text-slate-600 active:bg-slate-50"}`}>
                {value}
              </button>)}
            </div>
          </div>;
        })}
      </div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">今日使える時間</h2>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {AVAILABLE_MINUTES.map((minutes) => <button key={minutes} type="button" disabled={pending}
          onClick={() => setAvailableMinutes(minutes)}
          aria-pressed={availableMinutes === minutes}
          className={`min-h-12 rounded-xl text-sm font-bold disabled:opacity-50 ${availableMinutes === minutes
            ? "bg-orange-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 active:bg-slate-50"}`}>
          {minutes}分
        </button>)}
      </div>
    </section>

    <button type="submit" disabled={pending}
      className="min-h-12 w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50 active:bg-orange-600">
      {pending ? "保存中…" : "保存"}
    </button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
