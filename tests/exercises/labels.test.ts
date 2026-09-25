import { describe, expect, it } from "vitest";
import { equipmentLabel, exerciseLabel, muscleLabel } from "@/lib/exercises/labels";
import { seededExercises, seededMuscles } from "./seed-data";

describe("exercise labels", () => {
  it.each([
    ["Bench Press", "ベンチプレス"], ["Squat", "スクワット"], ["Deadlift", "デッドリフト"], ["Lat Pulldown", "ラットプルダウン"],
    ["Shoulder Press", "ショルダープレス"], ["Dumbbell Curl", "ダンベルカール"], ["Triceps Pushdown", "トライセプスプッシュダウン"],
    ["Calf Raise", "カーフレイズ"], ["Leg Press", "レッグプレス"], ["Crunch", "クランチ"],
  ])("%s -> %s", (name, label) => expect(exerciseLabel(name)).toBe(label));

  it("labels every seeded exercise (nothing falls back to English)", () => {
    expect(seededExercises).toHaveLength(10);
    for (const name of seededExercises) expect(exerciseLabel(name), name).not.toBe(name);
  });

  it("shows an unknown name as it is instead of hiding it", () => expect(exerciseLabel("New Move")).toBe("New Move"));
});

describe("muscle labels", () => {
  it.each([
    ["Chest", "胸"], ["Lats", "広背筋"], ["Triceps", "上腕三頭筋"], ["Biceps", "上腕二頭筋"],
    ["Front Deltoid", "三角筋前部"], ["Side Deltoid", "三角筋中部"], ["Rear Deltoid", "三角筋後部"],
    ["Quadriceps", "大腿四頭筋"], ["Hamstrings", "ハムストリングス"], ["Glutes", "臀筋"], ["Calves", "ふくらはぎ"], ["Abs", "腹筋"],
  ])("%s -> %s", (name, label) => expect(muscleLabel(name)).toBe(label));

  it("labels every seeded muscle", () => {
    expect(seededMuscles).toHaveLength(12);
    for (const name of seededMuscles) expect(muscleLabel(name), name).not.toBe(name);
  });

  it("shows an unknown name as it is", () => expect(muscleLabel("Traps")).toBe("Traps"));
});

describe("equipment labels", () => {
  it.each([
    ["BARBELL", "バーベル"], ["DUMBBELL", "ダンベル"], ["MACHINE", "マシン"], ["CABLE", "ケーブル"], ["BODYWEIGHT", "自重"], ["OTHER", "その他"],
  ])("%s -> %s", (type, label) => expect(equipmentLabel(type)).toBe(label));
});
