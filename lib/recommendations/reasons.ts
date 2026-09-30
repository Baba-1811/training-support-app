import { categoryLabel, type CategorySlug } from "@/lib/exercises/categories";

// Pure template text, never an LLM: the same input always produces the same sentence, so a reason can always be
// traced back to the rule that produced it. Kept to 1-2 short sentences for the future Home card (Phase 5C).

export type WorkoutReasonInput = {
  coldStart: boolean;
  reducedLoad: boolean;
  // Categories excluded from consideration entirely because a PRIMARY muscle scored soreness >= 4 (rules.ts).
  excludedCategories: readonly CategorySlug[];
  // Selected categories whose recency bucket is "7+" or "never" (rules.ts) — the ones actually chosen because
  // they had gone the longest without training, not just any selected category.
  prioritizedCategories: readonly CategorySlug[];
  // At least one selected Exercise was penalized (not excluded) for a sore SECONDARY muscle.
  hasSecondarySorenessNote: boolean;
};

function joinLabels(categories: readonly CategorySlug[]): string {
  return categories.map((category) => categoryLabel(category)).join("と");
}

export function buildWorkoutReason(input: WorkoutReasonInput): string {
  const sentences: string[] = [];
  if (input.coldStart) {
    sentences.push("まだトレーニング記録がないため、複数の部位をバランスよく鍛えるメニューを提案しています。");
  } else if (input.excludedCategories.length > 0 && input.prioritizedCategories.length > 0) {
    sentences.push(
      `${joinLabels(input.excludedCategories)}には強い筋肉痛があるため避け、` +
      `前回から間隔が空いている${joinLabels(input.prioritizedCategories)}を中心に選びました。`,
    );
  } else if (input.prioritizedCategories.length > 0) {
    sentences.push(`前回から間隔が空いている${joinLabels(input.prioritizedCategories)}を中心に選びました。`);
  } else if (input.excludedCategories.length > 0) {
    sentences.push(`${joinLabels(input.excludedCategories)}には強い筋肉痛があるため避け、他の部位を中心に選びました。`);
  } else {
    sentences.push("今日のコンディションに合わせてメニューを選びました。");
  }
  if (input.reducedLoad) sentences.push("今日は疲労を考慮してセット数を抑えています。");
  if (input.hasSecondarySorenessNote) sentences.push("補助的に使う部位に疲労があるため、無理のない範囲で調整しています。");
  return sentences.join("");
}

// No medical claim, no diagnosis — just "many parts are sore, so rest today". The specific excluded categories
// are deliberately not enumerated here (unlike buildWorkoutReason) to keep a rest day's message simple.
export function buildRestReason(): string {
  return "強い筋肉痛がある部位が多いため、今日は休養を優先します。";
}
