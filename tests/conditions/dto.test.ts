import { describe, expect, it } from "vitest";
import { restoreSorenessByCategory, toRecommendationInput } from "@/lib/conditions/dto";

describe("restoreSorenessByCategory (DB Muscle rows -> UI category)", () => {
  it("restores a category from its saveDailyCondition-written muscles (legs = Quadriceps/Hamstrings/Glutes/Calves)", () => {
    const rows = ["Quadriceps", "Hamstrings", "Glutes", "Calves"].map((muscleName) => ({ muscleName, sorenessLevel: 4 }));
    expect(restoreSorenessByCategory(rows)).toEqual({ legs: 4 });
  });

  it("restores several categories independently", () => {
    const rows = [
      { muscleName: "Chest", sorenessLevel: 2 },
      { muscleName: "Front Deltoid", sorenessLevel: 5 },
      { muscleName: "Side Deltoid", sorenessLevel: 5 },
      { muscleName: "Rear Deltoid", sorenessLevel: 5 },
    ];
    expect(restoreSorenessByCategory(rows)).toEqual({ chest: 2, shoulders: 5 });
  });

  it("returns an empty object (no category) when there are no rows: 筋肉痛なし", () => {
    expect(restoreSorenessByCategory([])).toEqual({});
  });

  it("ignores a Muscle the category map does not know, instead of throwing", () => {
    expect(restoreSorenessByCategory([{ muscleName: "Traps", sorenessLevel: 3 }])).toEqual({});
  });

  it("takes the MAX level on an inconsistent category (never averages, never guesses)", () => {
    const rows = [
      { muscleName: "Quadriceps", sorenessLevel: 2 },
      { muscleName: "Hamstrings", sorenessLevel: 5 },
      { muscleName: "Glutes", sorenessLevel: 3 },
      { muscleName: "Calves", sorenessLevel: 2 },
    ];
    expect(restoreSorenessByCategory(rows)).toEqual({ legs: 5 });
  });
});

describe("toRecommendationInput (Phase 5 DTO)", () => {
  it("keeps sleep/fatigue/availableMinutes and maps soreness by individual Muscle name, not by category", () => {
    const condition = {
      conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60,
      muscleConditions: [{ muscleName: "Quadriceps", sorenessLevel: 4 }, { muscleName: "Chest", sorenessLevel: 2 }],
    };
    expect(toRecommendationInput(condition)).toEqual({
      conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60,
      sorenessByMuscle: { Quadriceps: 4, Chest: 2 },
    });
  });

  it("keeps null fields as null and gives an empty map for no soreness", () => {
    const condition = { conditionDate: "2026-09-28", sleepHours: null, fatigueLevel: null, availableMinutes: null, muscleConditions: [] };
    expect(toRecommendationInput(condition)).toEqual({
      conditionDate: "2026-09-28", sleepHours: null, fatigueLevel: null, availableMinutes: null, sorenessByMuscle: {},
    });
  });
});
