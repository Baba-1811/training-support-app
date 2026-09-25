import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXERCISE_IMAGES, NEUTRAL_BODY_IMAGE, exerciseImage } from "@/lib/exercises/assets";
import { EXERCISE_CATEGORIES } from "@/lib/exercises/categories";
import { primaryMusclesOf, seededExercises } from "./seed-data";

const onDisk = (src: string) => existsSync(join(process.cwd(), "public", src));

describe("exercise -> image (keyed by Exercise.name)", () => {
  it.each([
    ["Bench Press", "bench-press"], ["Squat", "squat"], ["Deadlift", "deadlift"], ["Lat Pulldown", "lat-pulldown"],
    ["Shoulder Press", "shoulder-press"], ["Dumbbell Curl", "biceps-curl"], ["Leg Press", "leg-press"], ["Crunch", "crunch"],
  ])("%s -> /images/exercises/%s.jpg", (name, file) => {
    expect(exerciseImage(name, []).src).toBe(`/images/exercises/${file}.jpg`);
    expect(exerciseImage(name, []).kind).toBe("exercise");
  });

  it("has exactly the eight exercise pictures, each used once", () => {
    expect(Object.keys(EXERCISE_IMAGES)).toHaveLength(8);
    expect(new Set(Object.values(EXERCISE_IMAGES)).size).toBe(8);
  });
});

describe("fallback for exercises without their own picture", () => {
  it("Triceps Pushdown -> arms.jpg (muscle image)", () => {
    expect(exerciseImage("Triceps Pushdown", ["Triceps"])).toEqual({ src: "/images/muscles/arms.jpg", kind: "muscle" });
  });
  it("Calf Raise -> legs.jpg (muscle image)", () => {
    expect(exerciseImage("Calf Raise", ["Calves"])).toEqual({ src: "/images/muscles/legs.jpg", kind: "muscle" });
  });
  it("never borrows another exercise's picture", () => {
    for (const name of ["Triceps Pushdown", "Calf Raise", "Something New"]) {
      expect(exerciseImage(name, ["Triceps"]).src, name).not.toMatch(/\/images\/exercises\//);
    }
  });
  it("uses the neutral body image when nothing is known", () => {
    expect(exerciseImage("Something New", [])).toEqual({ src: NEUTRAL_BODY_IMAGE, kind: "muscle" });
    expect(exerciseImage("Something New", ["Traps"])).toEqual({ src: NEUTRAL_BODY_IMAGE, kind: "muscle" });
  });
  it("resolves every seeded exercise to an image (own or fallback)", () => {
    for (const name of seededExercises) expect(exerciseImage(name, primaryMusclesOf(name)).src, name).toBeTruthy();
  });
});

describe("images exist in public/", () => {
  it.each(Object.values(EXERCISE_IMAGES))("%s", (src) => expect(onDisk(src), src).toBe(true));
  it.each(EXERCISE_CATEGORIES.map((category) => category.imageSrc))("%s", (src) => expect(onDisk(src), src).toBe(true));
  it("neutral body image", () => expect(onDisk(NEUTRAL_BODY_IMAGE)).toBe(true));
});
