import { categoryImage, exerciseCategories } from "./categories";

// Exercise images are keyed by Exercise.name (unique and stable), never by the DB-generated id, which differs per environment.
// An exercise without its own picture is NOT given another exercise's picture: it falls back to a muscle image instead.
export const EXERCISE_IMAGES: Readonly<Record<string, string>> = {
  "Bench Press": "/images/exercises/bench-press.jpg",
  Squat: "/images/exercises/squat.jpg",
  Deadlift: "/images/exercises/deadlift.jpg",
  "Lat Pulldown": "/images/exercises/lat-pulldown.jpg",
  "Shoulder Press": "/images/exercises/shoulder-press.jpg",
  "Dumbbell Curl": "/images/exercises/biceps-curl.jpg",
  "Leg Press": "/images/exercises/leg-press.jpg",
  Crunch: "/images/exercises/crunch.jpg",
};

export const NEUTRAL_BODY_IMAGE = "/images/muscles/body.jpg";

// "exercise" images are landscape photos of the movement; "muscle" images are portrait body charts (shown contained, not stretched).
export type ExerciseImage = { src: string; kind: "exercise" | "muscle" };

export function exerciseImage(name: string, primaryMuscleNames: readonly string[]): ExerciseImage {
  const own = EXERCISE_IMAGES[name];
  if (own) return { src: own, kind: "exercise" };
  const [category] = exerciseCategories(primaryMuscleNames);
  return { src: category ? categoryImage(category) : NEUTRAL_BODY_IMAGE, kind: "muscle" };
}
