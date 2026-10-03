-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "weightIncrementKg" DECIMAL(6,2);

-- Check Constraints
ALTER TABLE "Exercise"
ADD CONSTRAINT "Exercise_weightIncrementKg_check"
CHECK ("weightIncrementKg" IS NULL OR "weightIncrementKg" > 0);
