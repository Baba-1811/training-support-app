// Japanese display names. The DB keeps its English names; an unknown name is shown as-is instead of hiding the row.
export const EXERCISE_LABELS: Readonly<Record<string, string>> = {
  "Bench Press": "ベンチプレス",
  Squat: "スクワット",
  Deadlift: "デッドリフト",
  "Lat Pulldown": "ラットプルダウン",
  "Shoulder Press": "ショルダープレス",
  "Dumbbell Curl": "ダンベルカール",
  "Triceps Pushdown": "トライセプスプッシュダウン",
  "Calf Raise": "カーフレイズ",
  "Leg Press": "レッグプレス",
  Crunch: "クランチ",
};

export const MUSCLE_LABELS: Readonly<Record<string, string>> = {
  Chest: "胸",
  Lats: "広背筋",
  Triceps: "上腕三頭筋",
  Biceps: "上腕二頭筋",
  "Front Deltoid": "三角筋前部",
  "Side Deltoid": "三角筋中部",
  "Rear Deltoid": "三角筋後部",
  Quadriceps: "大腿四頭筋",
  Hamstrings: "ハムストリングス",
  Glutes: "臀筋",
  Calves: "ふくらはぎ",
  Abs: "腹筋",
};

export const EQUIPMENT_LABELS: Readonly<Record<string, string>> = {
  BARBELL: "バーベル",
  DUMBBELL: "ダンベル",
  MACHINE: "マシン",
  CABLE: "ケーブル",
  BODYWEIGHT: "自重",
  OTHER: "その他",
};

export const exerciseLabel = (name: string): string => EXERCISE_LABELS[name] ?? name;
export const muscleLabel = (name: string): string => MUSCLE_LABELS[name] ?? name;
export const equipmentLabel = (equipmentType: string): string => EQUIPMENT_LABELS[equipmentType] ?? equipmentType;
