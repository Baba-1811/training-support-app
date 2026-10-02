import {
  formatRecommendationActualSets, formatRecommendationEvaluationStatus, formatRecommendationPlannedSummary,
  type WorkoutRecommendationEvaluationSummary,
} from "@/lib/workouts/recommendation-evaluation-format";
import type { RecommendedExerciseEvaluation, RecommendedExerciseStatus } from "@/lib/workouts/recommendation-evaluation";

// Phase 5F-2: "今日の結果" — the Recommendation Workout's overall result, shown once per completed Workout.
// Read-only, derived-data display only (same convention as RecommendationTargetCard): nothing here re-judges
// ACHIEVED/EXCEEDED/PARTIAL/NOT_PERFORMED, it only renders what evaluateWorkoutRecommendations already decided.
// Distinct from RecommendationTargetCard (today's plan, per Exercise, unchanged by this Phase): this card is
// the Workout-wide outcome, and each entry's own planned/actual line is this card's per-Exercise detail.

const STATUS_BADGE_STYLE: Record<RecommendedExerciseStatus, string> = {
  ACHIEVED: "border-orange-200 bg-orange-50 text-orange-700",
  EXCEEDED: "border-sky-200 bg-sky-50 text-sky-700",
  PARTIAL: "border-slate-200 bg-slate-100 text-slate-500",
  NOT_PERFORMED: "border-slate-200 bg-slate-100 text-slate-500",
};

function StatusBadge({ status }: { status: RecommendedExerciseStatus }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_STYLE[status]}`}>
    {formatRecommendationEvaluationStatus(status)}
  </span>;
}

export function RecommendationResultCard({ summary, entries }: {
  summary: WorkoutRecommendationEvaluationSummary;
  entries: ReadonlyArray<{ id: string; name: string; evaluation: RecommendedExerciseEvaluation }>;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-base font-bold text-slate-900">今日の結果</h2>
    <p className="mt-1 text-sm text-slate-600">おすすめメニュー {summary.totalExercises}種目中 {summary.metOrExceededCount}種目達成</p>
    <ul className="mt-3 space-y-2">
      {entries.map(({ id, name, evaluation }) => {
        const actual = formatRecommendationActualSets(evaluation.sets);
        return <li key={id} className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{name}</p>
            <StatusBadge status={evaluation.status} />
          </div>
          <p className="mt-1 text-xs tabular-nums text-slate-500">{evaluation.completedWorkingSets} / {evaluation.plannedSets} セット</p>
          <p className="mt-1 text-xs text-slate-400">予定 {formatRecommendationPlannedSummary(evaluation)}</p>
          {actual !== null && <p className="mt-0.5 text-xs tabular-nums text-slate-600">実績 {actual}</p>}
        </li>;
      })}
    </ul>
  </section>;
}
