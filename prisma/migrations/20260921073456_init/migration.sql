-- CreateEnum
CREATE TYPE "TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('ESTIMATED_1RM', 'BODY_WEIGHT', 'TRAINING_FREQUENCY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MuscleRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkoutPlanStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkoutSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('WARMUP', 'WORKING');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "trainingLevel" "TrainingLevel" NOT NULL,
    "weeklyTrainingTarget" INTEGER,
    "heightCm" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMeasurement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weightKg" DECIMAL(5,2) NOT NULL,
    "bodyFatPercent" DECIMAL(5,2),
    "measuredAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "exerciseId" UUID,
    "goalType" "GoalType" NOT NULL,
    "targetValue" DECIMAL(8,2) NOT NULL,
    "targetDate" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCondition" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conditionDate" DATE NOT NULL,
    "sleepHours" DECIMAL(4,2),
    "fatigueLevel" INTEGER,
    "availableMinutes" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DailyCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleCondition" (
    "id" UUID NOT NULL,
    "dailyConditionId" UUID NOT NULL,
    "muscleId" UUID NOT NULL,
    "sorenessLevel" INTEGER NOT NULL,

    CONSTRAINT "MuscleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Muscle" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "bodyRegion" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Muscle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "tips" TEXT,
    "equipmentType" "EquipmentType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMuscle" (
    "exerciseId" UUID NOT NULL,
    "muscleId" UUID NOT NULL,
    "role" "MuscleRole" NOT NULL,

    CONSTRAINT "ExerciseMuscle_pkey" PRIMARY KEY ("exerciseId","muscleId")
);

-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceConditionId" UUID,
    "plannedDate" DATE NOT NULL,
    "status" "WorkoutPlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "recommendationReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPlanExercise" (
    "id" UUID NOT NULL,
    "workoutPlanId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "exerciseOrder" INTEGER NOT NULL,
    "targetWeightKg" DECIMAL(6,2),
    "targetRepsMin" INTEGER,
    "targetRepsMax" INTEGER,
    "targetSets" INTEGER NOT NULL,
    "restSeconds" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutPlanExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workoutPlanId" UUID,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "status" "WorkoutSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" UUID NOT NULL,
    "workoutSessionId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "exerciseOrder" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" UUID NOT NULL,
    "workoutExerciseId" UUID NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weightKg" DECIMAL(6,2) NOT NULL,
    "reps" INTEGER NOT NULL,
    "setType" "SetType" NOT NULL DEFAULT 'WORKING',
    "rir" DECIMAL(3,1),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BodyMeasurement_userId_measuredAt_idx" ON "BodyMeasurement"("userId", "measuredAt");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_exerciseId_idx" ON "Goal"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCondition_userId_conditionDate_key" ON "DailyCondition"("userId", "conditionDate");

-- CreateIndex
CREATE INDEX "MuscleCondition_muscleId_idx" ON "MuscleCondition"("muscleId");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleCondition_dailyConditionId_muscleId_key" ON "MuscleCondition"("dailyConditionId", "muscleId");

-- CreateIndex
CREATE UNIQUE INDEX "Muscle_name_key" ON "Muscle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- CreateIndex
CREATE INDEX "ExerciseMuscle_muscleId_idx" ON "ExerciseMuscle"("muscleId");

-- CreateIndex
CREATE INDEX "WorkoutPlan_userId_plannedDate_idx" ON "WorkoutPlan"("userId", "plannedDate");

-- CreateIndex
CREATE INDEX "WorkoutPlan_sourceConditionId_idx" ON "WorkoutPlan"("sourceConditionId");

-- CreateIndex
CREATE INDEX "WorkoutPlanExercise_exerciseId_idx" ON "WorkoutPlanExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlanExercise_workoutPlanId_exerciseOrder_key" ON "WorkoutPlanExercise"("workoutPlanId", "exerciseOrder");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_startedAt_idx" ON "WorkoutSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkoutSession_workoutPlanId_idx" ON "WorkoutSession"("workoutPlanId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutSessionId_exerciseId_idx" ON "WorkoutExercise"("workoutSessionId", "exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutExercise_workoutSessionId_exerciseOrder_key" ON "WorkoutExercise"("workoutSessionId", "exerciseOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSet_workoutExerciseId_setNumber_key" ON "WorkoutSet"("workoutExerciseId", "setNumber");

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCondition" ADD CONSTRAINT "DailyCondition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleCondition" ADD CONSTRAINT "MuscleCondition_dailyConditionId_fkey" FOREIGN KEY ("dailyConditionId") REFERENCES "DailyCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleCondition" ADD CONSTRAINT "MuscleCondition_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_sourceConditionId_fkey" FOREIGN KEY ("sourceConditionId") REFERENCES "DailyCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Check Constraints
-- ============================================================

-- User
ALTER TABLE "User"
ADD CONSTRAINT "User_weeklyTrainingTarget_check"
CHECK ("weeklyTrainingTarget" IS NULL OR "weeklyTrainingTarget" BETWEEN 1 AND 7);

ALTER TABLE "User"
ADD CONSTRAINT "User_heightCm_check"
CHECK ("heightCm" IS NULL OR "heightCm" > 0);

-- BodyMeasurement
ALTER TABLE "BodyMeasurement"
ADD CONSTRAINT "BodyMeasurement_weightKg_check"
CHECK ("weightKg" > 0);

ALTER TABLE "BodyMeasurement"
ADD CONSTRAINT "BodyMeasurement_bodyFatPercent_check"
CHECK ("bodyFatPercent" IS NULL OR "bodyFatPercent" BETWEEN 0 AND 100);

-- Goal
ALTER TABLE "Goal"
ADD CONSTRAINT "Goal_targetValue_check"
CHECK ("targetValue" > 0);

-- DailyCondition
ALTER TABLE "DailyCondition"
ADD CONSTRAINT "DailyCondition_sleepHours_check"
CHECK ("sleepHours" IS NULL OR "sleepHours" BETWEEN 0 AND 24);

ALTER TABLE "DailyCondition"
ADD CONSTRAINT "DailyCondition_fatigueLevel_check"
CHECK ("fatigueLevel" IS NULL OR "fatigueLevel" BETWEEN 1 AND 5);

ALTER TABLE "DailyCondition"
ADD CONSTRAINT "DailyCondition_availableMinutes_check"
CHECK ("availableMinutes" IS NULL OR "availableMinutes" > 0);

-- MuscleCondition
ALTER TABLE "MuscleCondition"
ADD CONSTRAINT "MuscleCondition_sorenessLevel_check"
CHECK ("sorenessLevel" BETWEEN 1 AND 5);

-- WorkoutPlanExercise
ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_exerciseOrder_check"
CHECK ("exerciseOrder" >= 1);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_targetWeightKg_check"
CHECK ("targetWeightKg" IS NULL OR "targetWeightKg" >= 0);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_targetRepsMin_check"
CHECK ("targetRepsMin" IS NULL OR "targetRepsMin" >= 1);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_targetRepsMax_check"
CHECK ("targetRepsMax" IS NULL OR "targetRepsMax" >= 1);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_repsRange_check"
CHECK (
  "targetRepsMin" IS NULL
  OR "targetRepsMax" IS NULL
  OR "targetRepsMin" <= "targetRepsMax"
);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_targetSets_check"
CHECK ("targetSets" >= 1);

ALTER TABLE "WorkoutPlanExercise"
ADD CONSTRAINT "WorkoutPlanExercise_restSeconds_check"
CHECK ("restSeconds" IS NULL OR "restSeconds" >= 0);

-- WorkoutExercise
ALTER TABLE "WorkoutExercise"
ADD CONSTRAINT "WorkoutExercise_exerciseOrder_check"
CHECK ("exerciseOrder" >= 1);

-- WorkoutSet
ALTER TABLE "WorkoutSet"
ADD CONSTRAINT "WorkoutSet_setNumber_check"
CHECK ("setNumber" >= 1);

ALTER TABLE "WorkoutSet"
ADD CONSTRAINT "WorkoutSet_weightKg_check"
CHECK ("weightKg" >= 0);

ALTER TABLE "WorkoutSet"
ADD CONSTRAINT "WorkoutSet_reps_check"
CHECK ("reps" >= 0);

ALTER TABLE "WorkoutSet"
ADD CONSTRAINT "WorkoutSet_rir_check"
CHECK ("rir" IS NULL OR "rir" >= 0);