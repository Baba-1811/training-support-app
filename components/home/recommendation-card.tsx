import Image from "next/image";
import Link from "next/link";
import { exerciseLabel } from "@/lib/exercises/labels";
import {
  formatRestSeconds, formatTargetRepsAndSets, formatTargetWeight, joinCategoryLabels, recommendedCategoryImage,
} from "@/lib/recommendations/display";
import type { RecommendationResult } from "@/lib/recommendations/types";
import { StartFromRecommendationButton } from "./start-from-recommendation-button";

// Home "今日のおすすめ" card. Server Component: the Recommendation data is already server-computed, and the
// only interactive part (Phase 5D's Start button) is split out into its own small Client Component below, so
// this card never needs a client directive of its own. Starting a WORKOUT recommendation re-fetches and
// re-persists on the server (see lib/workouts/mutations.ts) — this component only renders what it is given and
// never calls that mutation layer or Prisma directly.
export function RecommendationCard({ recommendation }: { recommendation: RecommendationResult | null }) {
  if (recommendation === null) {
    return <section aria-labelledby="recommendation-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="recommendation-heading" className="text-base font-bold text-slate-900">今日のおすすめ</h2>
      <p className="mt-1 text-sm text-slate-500">今日のコンディションを入力すると、おすすめメニューを提案します。</p>
      <Link href="/condition" className="mt-2 inline-block text-sm font-semibold text-orange-600 underline underline-offset-2 active:text-orange-700">
        コンディションを入力
      </Link>
    </section>;
  }

  if (recommendation.kind === "REST") {
    return <section aria-labelledby="recommendation-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="recommendation-heading" className="text-base font-bold text-slate-900">今日のおすすめ</h2>
      <p className="mt-2 text-sm font-semibold text-slate-900">今日は休養がおすすめです</p>
      <p className="mt-1 text-sm text-slate-500">{recommendation.recommendationReason}</p>
    </section>;
  }

  const categorySummary = joinCategoryLabels(recommendation.selectedCategories);
  return <section aria-labelledby="recommendation-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 id="recommendation-heading" className="text-base font-bold text-slate-900">今日のおすすめ</h2>
    <div className="mt-2 flex items-center gap-3">
      <Image src={recommendedCategoryImage(recommendation.selectedCategories)} alt={`${categorySummary}のイメージ`} width={56} height={56}
        className="h-14 w-14 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{categorySummary}</p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">{recommendation.recommendationReason}</p>
      </div>
    </div>
    <ul className="mt-3 space-y-2">
      {recommendation.exercises.map((exercise) => {
        const weight = formatTargetWeight(exercise.targetWeightKg);
        return <li key={exercise.exerciseId} className="rounded-xl bg-slate-50 p-3">
          <p className="truncate text-sm font-semibold text-slate-900">{exerciseLabel(exercise.exerciseName)}</p>
          <p className="truncate text-xs text-slate-400">{exercise.exerciseName}</p>
          <p className="mt-1 text-xs text-slate-600">
            {weight !== null && <>{weight}・</>}{formatTargetRepsAndSets(exercise)}・{formatRestSeconds(exercise.restSeconds)}
          </p>
        </li>;
      })}
    </ul>
    <StartFromRecommendationButton />
  </section>;
}
