import {
  formatRecommendationRepsAndSets, formatRecommendationRest, formatRecommendationWeight, recommendationTargetLabel,
} from "@/lib/workouts/recommendation-target-format";
import type { WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";

// Read-only snapshot display (Phase 5E-1): WorkoutPlanExercise as saved at Start time, never recomputed here and
// never fed back into a Set input or auto-created as a WorkoutSet — this component only renders what it is
// given. `completed` only changes the label's wording (今日の/この日の); the values themselves are the same
// snapshot either way.
export function RecommendationTargetCard({ target, completed }: { target: WorkoutRecommendationTargetDTO | null; completed: boolean }) {
  if (!target) return null;
  const weight = formatRecommendationWeight(target);
  const rest = formatRecommendationRest(target);
  return <div className="mb-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
    <p className="text-[11px] font-medium text-orange-700">{recommendationTargetLabel(completed)}</p>
    <div className="mt-1 text-xs tabular-nums text-slate-700">
      {weight !== null && <p className="font-semibold text-slate-900">{weight}</p>}
      <p>{formatRecommendationRepsAndSets(target)}</p>
      {rest !== null && <p className="text-slate-500">{rest}</p>}
    </div>
  </div>;
}
