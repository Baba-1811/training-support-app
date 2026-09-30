import { describe, expect, it } from "vitest";
import { buildWorkoutReason, buildRestReason } from "@/lib/recommendations/reasons";

const base = { coldStart: false, reducedLoad: false, excludedCategories: [], prioritizedCategories: [], hasSecondarySorenessNote: false };

describe("buildWorkoutReason", () => {
  it("is deterministic: the same input always produces the same text", () => {
    const input = { ...base, prioritizedCategories: ["chest", "back"] as const };
    expect(buildWorkoutReason(input)).toBe(buildWorkoutReason(input));
  });

  it("cold start takes its own template, mentioning no specific category", () => {
    const text = buildWorkoutReason({ ...base, coldStart: true });
    expect(text).toContain("まだトレーニング記録がない");
    expect(text).not.toContain("胸");
  });

  it("mentions prioritized (long-idle) categories by their Japanese label", () => {
    const text = buildWorkoutReason({ ...base, prioritizedCategories: ["chest", "back"] });
    expect(text).toContain("胸");
    expect(text).toContain("背中");
    expect(text).toContain("間隔が空いている");
  });

  it("mentions excluded categories together with prioritized ones when both are present", () => {
    const text = buildWorkoutReason({ ...base, excludedCategories: ["legs"], prioritizedCategories: ["chest"] });
    expect(text).toContain("脚");
    expect(text).toContain("強い筋肉痛");
    expect(text).toContain("胸");
  });

  it("mentions excluded categories alone when there is nothing prioritized to contrast them with", () => {
    const text = buildWorkoutReason({ ...base, excludedCategories: ["legs"] });
    expect(text).toContain("脚");
    expect(text).toContain("強い筋肉痛");
  });

  it("falls back to a generic sentence with neither exclusions nor priorities nor cold start", () => {
    const text = buildWorkoutReason(base);
    expect(text.length).toBeGreaterThan(0);
  });

  it("appends the reducedLoad sentence only when reducedLoad is true", () => {
    expect(buildWorkoutReason({ ...base, reducedLoad: true })).toContain("疲労を考慮してセット数を抑えています");
    expect(buildWorkoutReason({ ...base, reducedLoad: false })).not.toContain("セット数を抑えています");
  });

  it("appends the secondary-soreness caveat only when hasSecondarySorenessNote is true", () => {
    expect(buildWorkoutReason({ ...base, hasSecondarySorenessNote: true })).toContain("無理のない範囲で");
    expect(buildWorkoutReason({ ...base, hasSecondarySorenessNote: false })).not.toContain("無理のない範囲で");
  });

  it("can combine reducedLoad and secondary-soreness sentences with the main sentence", () => {
    const text = buildWorkoutReason({ ...base, prioritizedCategories: ["legs"], reducedLoad: true, hasSecondarySorenessNote: true });
    expect(text).toContain("脚");
    expect(text).toContain("セット数を抑えています");
    expect(text).toContain("無理のない範囲で");
  });
});

describe("buildRestReason", () => {
  it("is a fixed, deterministic sentence with no diagnosis or medical claim", () => {
    expect(buildRestReason()).toBe(buildRestReason());
    expect(buildRestReason()).toContain("休養");
    expect(buildRestReason()).not.toContain("怪我");
    expect(buildRestReason()).not.toContain("診断");
  });
});
