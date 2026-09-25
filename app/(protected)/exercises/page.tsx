import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { categoryLabel, filterByCategory, parseCategoryFilter } from "@/lib/exercises/categories";
import { listExercises } from "@/lib/exercises/queries";
import { CategoryFilter } from "@/components/exercises/category-filter";
import { ExerciseCard } from "@/components/exercises/exercise-card";

// Exercise Library: pick a body part, then an exercise. `?muscle=` is optional; anything unknown means "すべて".
export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireUser();
  const filter = parseCategoryFilter((await searchParams).muscle);
  const exercises = filterByCategory(await listExercises(), filter);
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-slate-500 active:text-orange-600">← トレーニング</Link>
    <h1 className="mt-3 text-xl font-bold">種目を探す</h1>
    <p className="mt-1 text-sm text-slate-500">鍛えたい部位から種目を探せます</p>
    <div className="mt-4"><CategoryFilter selected={filter} /></div>
    <section aria-labelledby="exercise-list-heading" className="mt-5">
      <h2 id="exercise-list-heading" className="text-sm font-bold text-slate-600">
        {categoryLabel(filter)}<span className="ml-1.5 text-xs font-medium text-slate-400">{exercises.length}種目</span>
      </h2>
      {exercises.length === 0
        ? <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
          この部位の種目はまだありません。
        </div>
        : <ul className="mt-3 space-y-3">
          {exercises.map((exercise) => <li key={exercise.id}><ExerciseCard exercise={exercise} /></li>)}
        </ul>}
    </section>
  </main>;
}
