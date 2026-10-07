import Link from "next/link";
import { getNutritionDashboard } from "@/lib/nutrition/queries";
import { groupEntriesByMeal, MEAL_SECTIONS } from "@/lib/nutrition/display";
import { jstDateOnly, parseJstDateString } from "@/lib/date/jst";
import { MealSection } from "@/components/nutrition/meal-section";
import { TargetForm } from "@/components/nutrition/target-form";
import { WeightSection } from "@/components/nutrition/weight-section";
import { NutritionSummary } from "@/components/nutrition/nutrition-summary";

// /nutrition?date=YYYY-MM-DD shows that JST day; a missing, repeated or invalid value falls back to JST today.
export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const raw = (await searchParams).date;
  const today = jstDateOnly();
  const date = (typeof raw === "string" ? parseJstDateString(raw) : null) ?? today;
  const dashboard = await getNutritionDashboard(date);
  const grouped = groupEntriesByMeal(dashboard.entries);
  const isToday = date.getTime() === today.getTime();
  return <main className="mx-auto w-full max-w-[480px] space-y-4 px-4 py-5 text-slate-900">
    <div>
      <h1 className="text-xl font-bold">食事</h1>
      <p className="mt-1 text-sm text-slate-500">{isToday ? "今日" : dashboard.date}の食事を記録しましょう。PFCがわからなくてもカロリーだけで記録できます。</p>
    </div>
    <Link href="/nutrition/analytics" className="block text-right text-sm font-semibold text-sky-600">推移を見る →</Link>
    <NutritionSummary summary={dashboard.summary} target={dashboard.target} />
    <TargetForm date={dashboard.date} target={dashboard.target} />
    <WeightSection key={dashboard.date} date={dashboard.date} weight={dashboard.weight} />
    {MEAL_SECTIONS.map((mealType) => <MealSection key={mealType} date={dashboard.date} mealType={mealType} entries={grouped[mealType]} />)}
  </main>;
}
