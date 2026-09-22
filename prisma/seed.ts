import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  EquipmentType,
  MuscleRole,
} from "../app/generated/prisma/client";

const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("DIRECT_URL is not defined");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  // ============================================================
  // Muscle
  // ============================================================

  const muscles = [
    { name: "Chest", bodyRegion: "Upper Body" },
    { name: "Lats", bodyRegion: "Upper Body" },
    { name: "Triceps", bodyRegion: "Upper Body" },
    { name: "Biceps", bodyRegion: "Upper Body" },
    { name: "Front Deltoid", bodyRegion: "Upper Body" },
    { name: "Side Deltoid", bodyRegion: "Upper Body" },
    { name: "Rear Deltoid", bodyRegion: "Upper Body" },
    { name: "Quadriceps", bodyRegion: "Lower Body" },
    { name: "Hamstrings", bodyRegion: "Lower Body" },
    { name: "Glutes", bodyRegion: "Lower Body" },
    { name: "Calves", bodyRegion: "Lower Body" },
  ];

  for (const muscle of muscles) {
    await prisma.muscle.upsert({
      where: { name: muscle.name },
      update: {
        bodyRegion: muscle.bodyRegion,
        isActive: true,
      },
      create: muscle,
    });
  }

  // ============================================================
  // Exercise
  // ============================================================

  const exercises = [
    {
      name: "Bench Press",
      description: "バーベルを使用した胸の代表的なプレス種目。",
      instructions:
        "ベンチに仰向けになり、肩甲骨を寄せた状態でバーベルを胸付近まで下ろし、押し上げる。",
      tips: "肩がすくまないようにし、足・背中・肩を安定させる。",
      equipmentType: EquipmentType.BARBELL,
    },
    {
      name: "Squat",
      description: "下半身を総合的に鍛えるバーベル種目。",
      instructions:
        "バーベルを担ぎ、姿勢を保ちながら膝と股関節を曲げてしゃがみ、立ち上がる。",
      tips: "膝とつま先の向きをそろえ、腰が過度に丸まらないようにする。",
      equipmentType: EquipmentType.BARBELL,
    },
    {
      name: "Deadlift",
      description: "臀部やハムストリングスなどを鍛える複合種目。",
      instructions:
        "床のバーベルを握り、背中を安定させながら股関節と膝を伸ばして持ち上げる。",
      tips: "バーを身体から離しすぎず、腰だけで引かない。",
      equipmentType: EquipmentType.BARBELL,
    },
    {
      name: "Lat Pulldown",
      description: "主に広背筋を鍛えるマシン種目。",
      instructions:
        "バーを握り、胸を張った状態で鎖骨付近に向かって引き下ろす。",
      tips: "腕だけで引かず、肘を下方向へ動かす意識を持つ。",
      equipmentType: EquipmentType.MACHINE,
    },
    {
      name: "Shoulder Press",
      description: "主に肩を鍛えるプレス種目。",
      instructions:
        "肩付近から重量を頭上方向へ押し上げ、コントロールしながら戻す。",
      tips: "腰を過度に反らさず、動作中は体幹を安定させる。",
      equipmentType: EquipmentType.DUMBBELL,
    },
    {
      name: "Dumbbell Curl",
      description: "主に上腕二頭筋を鍛える種目。",
      instructions:
        "ダンベルを持ち、肘の位置を大きく動かさずに前腕を持ち上げる。",
      tips: "反動を使わず、ゆっくり下ろす。",
      equipmentType: EquipmentType.DUMBBELL,
    },
    {
      name: "Triceps Pushdown",
      description: "主に上腕三頭筋を鍛えるケーブル種目。",
      instructions:
        "肘を身体の横に固定し、ケーブルを下方向へ押し下げる。",
      tips: "肩を動かしすぎず、肘の伸展を意識する。",
      equipmentType: EquipmentType.CABLE,
    },
    {
      name: "Calf Raise",
      description: "ふくらはぎを鍛える種目。",
      instructions:
        "かかとをゆっくり持ち上げ、つま先立ちになってから戻す。",
      tips: "反動を使わず、可動域を確保する。",
      equipmentType: EquipmentType.BODYWEIGHT,
    },
  ];

  for (const exercise of exercises) {
    await prisma.exercise.upsert({
      where: { name: exercise.name },
      update: {
        ...exercise,
        isActive: true,
      },
      create: exercise,
    });
  }

  // ============================================================
  // ExerciseMuscle
  // ============================================================

  const relations = [
    ["Bench Press", "Chest", MuscleRole.PRIMARY],
    ["Bench Press", "Triceps", MuscleRole.SECONDARY],
    ["Bench Press", "Front Deltoid", MuscleRole.SECONDARY],

    ["Squat", "Quadriceps", MuscleRole.PRIMARY],
    ["Squat", "Glutes", MuscleRole.PRIMARY],
    ["Squat", "Hamstrings", MuscleRole.SECONDARY],

    ["Deadlift", "Glutes", MuscleRole.PRIMARY],
    ["Deadlift", "Hamstrings", MuscleRole.PRIMARY],
    ["Deadlift", "Lats", MuscleRole.SECONDARY],

    ["Lat Pulldown", "Lats", MuscleRole.PRIMARY],
    ["Lat Pulldown", "Biceps", MuscleRole.SECONDARY],

    ["Shoulder Press", "Front Deltoid", MuscleRole.PRIMARY],
    ["Shoulder Press", "Side Deltoid", MuscleRole.SECONDARY],
    ["Shoulder Press", "Triceps", MuscleRole.SECONDARY],

    ["Dumbbell Curl", "Biceps", MuscleRole.PRIMARY],

    ["Triceps Pushdown", "Triceps", MuscleRole.PRIMARY],

    ["Calf Raise", "Calves", MuscleRole.PRIMARY],
  ] as const;

  for (const [exerciseName, muscleName, role] of relations) {
    const exercise = await prisma.exercise.findUniqueOrThrow({
      where: { name: exerciseName },
    });

    const muscle = await prisma.muscle.findUniqueOrThrow({
      where: { name: muscleName },
    });

    await prisma.exerciseMuscle.upsert({
      where: {
        exerciseId_muscleId: {
          exerciseId: exercise.id,
          muscleId: muscle.id,
        },
      },
      update: { role },
      create: {
        exerciseId: exercise.id,
        muscleId: muscle.id,
        role,
      },
    });
  }

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });