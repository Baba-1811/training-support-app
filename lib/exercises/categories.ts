// Exercise Library categories. Pure (no React / Prisma) so the mapping can be tested on its own.
// The DB stays as it is: this only groups Muscle rows for the UI, keyed by Muscle.name (unique, fixed by the seed).
export type CategorySlug = "chest" | "back" | "shoulders" | "arms" | "legs" | "abs";
export type CategoryFilter = CategorySlug | "all";

export const EXERCISE_CATEGORIES: ReadonlyArray<{ slug: CategoryFilter; label: string; imageSrc: string }> = [
  { slug: "all", label: "すべて", imageSrc: "/images/muscles/full-body.jpg" },
  { slug: "chest", label: "胸", imageSrc: "/images/muscles/chest.jpg" },
  { slug: "back", label: "背中", imageSrc: "/images/muscles/back.jpg" },
  { slug: "shoulders", label: "肩", imageSrc: "/images/muscles/shoulders.jpg" },
  { slug: "arms", label: "腕", imageSrc: "/images/muscles/arms.jpg" },
  { slug: "legs", label: "脚", imageSrc: "/images/muscles/legs.jpg" },
  { slug: "abs", label: "腹筋", imageSrc: "/images/muscles/abs.jpg" },
];

export const MUSCLE_CATEGORY: Readonly<Record<string, CategorySlug>> = {
  Chest: "chest",
  Lats: "back",
  "Front Deltoid": "shoulders",
  "Side Deltoid": "shoulders",
  "Rear Deltoid": "shoulders",
  Biceps: "arms",
  Triceps: "arms",
  Quadriceps: "legs",
  Hamstrings: "legs",
  Glutes: "legs",
  Calves: "legs",
  Abs: "abs",
};

const SLUGS = new Set<string>(EXERCISE_CATEGORIES.map((category) => category.slug));

// `?muscle=` comes straight from the URL: anything that is not a known slug (or is repeated) means "all".
export function parseCategoryFilter(value: string | string[] | undefined): CategoryFilter {
  return typeof value === "string" && SLUGS.has(value) ? (value as CategoryFilter) : "all";
}

export function categoryLabel(slug: CategoryFilter): string {
  return EXERCISE_CATEGORIES.find((category) => category.slug === slug)?.label ?? "すべて";
}

export function categoryImage(slug: CategoryFilter): string {
  return (EXERCISE_CATEGORIES.find((category) => category.slug === slug) ?? EXERCISE_CATEGORIES[0]).imageSrc;
}

// Category of a single muscle; a muscle the UI does not know yet has no category (it never breaks a screen).
export function muscleCategory(muscleName: string): CategorySlug | null {
  return MUSCLE_CATEGORY[muscleName] ?? null;
}

// Only PRIMARY muscles decide the category. SECONDARY never does (Bench Press is 胸 only, not 腕 / 肩).
// An exercise whose PRIMARY muscles sit in several categories belongs to each of them.
export function exerciseCategories(primaryMuscleNames: readonly string[]): CategorySlug[] {
  const slugs = new Set<CategorySlug>();
  for (const name of primaryMuscleNames) {
    const slug = muscleCategory(name);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

export function filterByCategory<T extends { primaryMuscles: readonly string[] }>(exercises: readonly T[], filter: CategoryFilter): T[] {
  if (filter === "all") return [...exercises];
  return exercises.filter((exercise) => exerciseCategories(exercise.primaryMuscles).includes(filter));
}
