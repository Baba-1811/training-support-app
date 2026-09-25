import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { exerciseImage } from "@/lib/exercises/assets";
import { equipmentLabel, exerciseLabel, muscleLabel } from "@/lib/exercises/labels";
import { getExercise } from "@/lib/exercises/queries";
import { exerciseIdSchema } from "@/lib/exercises/validation";
import { workoutTitle } from "@/lib/workouts/calculations";
import { splitInProgress } from "@/lib/workouts/in-progress";
import { listInProgressWorkouts } from "@/lib/workouts/queries";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { StartWithExerciseButton } from "@/components/exercises/start-with-exercise-button";

// The DB text is shown as written (line breaks kept); nothing is split into invented steps.
function TextSection({ heading, text }: { heading: string; text: string | null }) {
  if (!text?.trim()) return null;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-sm font-bold text-slate-900">{heading}</h2>
    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{text}</p>
  </section>;
}

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!exerciseIdSchema.safeParse(id).success) notFound();
  const [exercise, inProgress] = await Promise.all([getExercise(id), listInProgressWorkouts()]);
  if (!exercise) notFound();
  const { current } = splitInProgress(inProgress);
  const name = exerciseLabel(exercise.name);
  const image = exerciseImage(exercise.name, exercise.primaryMuscles);
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <Link href="/exercises" className="inline-flex items-center gap-1 text-sm text-slate-500 active:text-orange-600">← 種目を探す</Link>
    <ExerciseImage image={image} priority sizes="(max-width: 480px) 100vw, 480px"
      alt={image.kind === "exercise" ? `${name}のフォームのイメージ` : `${name}で鍛える部位のイメージ`}
      className="mt-3 aspect-[4/3] w-full rounded-2xl border border-slate-200" />
    <header className="mt-4">
      <h1 className="text-xl font-bold">{name}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-400">{exercise.name}</p>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{equipmentLabel(exercise.equipmentType)}</span>
      </div>
    </header>

    <div className="mt-4 space-y-3">
      <section aria-labelledby="muscles-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="muscles-heading" className="text-sm font-bold text-slate-900">鍛えられる部位</h2>
        <dl className="mt-2 space-y-2">
          <div className="flex items-start gap-3">
            <dt className="w-12 shrink-0 pt-1 text-[11px] font-semibold text-orange-700">メイン</dt>
            <dd className="flex flex-wrap gap-1.5">
              {exercise.primaryMuscles.length === 0 ? <span className="text-xs text-slate-400">-</span>
                : exercise.primaryMuscles.map((muscle) => <span key={muscle} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{muscleLabel(muscle)}</span>)}
            </dd>
          </div>
          {exercise.secondaryMuscles.length > 0 && <div className="flex items-start gap-3">
            <dt className="w-12 shrink-0 pt-1 text-[11px] font-medium text-slate-400">サブ</dt>
            <dd className="flex flex-wrap gap-1.5">
              {exercise.secondaryMuscles.map((muscle) => <span key={muscle} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{muscleLabel(muscle)}</span>)}
            </dd>
          </div>}
        </dl>
      </section>
      <TextSection heading="説明" text={exercise.description} />
      <TextSection heading="やり方" text={exercise.instructions} />
      <TextSection heading="フォームのポイント" text={exercise.tips} />
    </div>

    <div className="mt-5">
      <StartWithExerciseButton exerciseId={exercise.id}
        currentWorkout={current ? { id: current.id, title: workoutTitle(current.title, current.startedAt) } : null} />
    </div>
  </main>;
}
