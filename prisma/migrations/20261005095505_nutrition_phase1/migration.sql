-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateTable
CREATE TABLE "NutritionEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entryDate" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "calories" INTEGER NOT NULL,
    "proteinGrams" DECIMAL(5,1),
    "fatGrams" DECIMAL(5,1),
    "carbsGrams" DECIMAL(5,1),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NutritionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTarget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetCalories" INTEGER NOT NULL,
    "targetProtein" DECIMAL(5,1),
    "targetFat" DECIMAL(5,1),
    "targetCarbs" DECIMAL(5,1),
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionEntry_userId_entryDate_idx" ON "NutritionEntry"("userId", "entryDate");

-- CreateIndex
CREATE INDEX "NutritionTarget_userId_effectiveFrom_idx" ON "NutritionTarget"("userId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "NutritionEntry" ADD CONSTRAINT "NutritionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "NutritionEntry"
ADD CONSTRAINT "NutritionEntry_calories_check"
CHECK ("calories" >= 0);

ALTER TABLE "NutritionEntry"
ADD CONSTRAINT "NutritionEntry_proteinGrams_check"
CHECK ("proteinGrams" IS NULL OR "proteinGrams" >= 0);

ALTER TABLE "NutritionEntry"
ADD CONSTRAINT "NutritionEntry_fatGrams_check"
CHECK ("fatGrams" IS NULL OR "fatGrams" >= 0);

ALTER TABLE "NutritionEntry"
ADD CONSTRAINT "NutritionEntry_carbsGrams_check"
CHECK ("carbsGrams" IS NULL OR "carbsGrams" >= 0);

ALTER TABLE "NutritionEntry"
ADD CONSTRAINT "NutritionEntry_name_check"
CHECK (btrim("name") <> '');

ALTER TABLE "NutritionTarget"
ADD CONSTRAINT "NutritionTarget_targetCalories_check"
CHECK ("targetCalories" >= 0);

ALTER TABLE "NutritionTarget"
ADD CONSTRAINT "NutritionTarget_targetProtein_check"
CHECK ("targetProtein" IS NULL OR "targetProtein" >= 0);

ALTER TABLE "NutritionTarget"
ADD CONSTRAINT "NutritionTarget_targetFat_check"
CHECK ("targetFat" IS NULL OR "targetFat" >= 0);

ALTER TABLE "NutritionTarget"
ADD CONSTRAINT "NutritionTarget_targetCarbs_check"
CHECK ("targetCarbs" IS NULL OR "targetCarbs" >= 0);