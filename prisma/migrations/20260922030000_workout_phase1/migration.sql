BEGIN;

ALTER TABLE "WorkoutSession" ADD COLUMN "title" VARCHAR(100);

CREATE TABLE "FavoriteExercise" (
    "userId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    CONSTRAINT "FavoriteExercise_pkey" PRIMARY KEY ("userId", "exerciseId")
);
CREATE INDEX "FavoriteExercise_exerciseId_idx" ON "FavoriteExercise"("exerciseId");
ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutSet" DROP CONSTRAINT "WorkoutSet_rir_check";
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_rir_check"
    CHECK ("rir" IS NULL OR "rir" BETWEEN 0 AND 10);
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_completed_values_check"
    CHECK (NOT "completed" OR ("reps" >= 1 AND "completedAt" IS NOT NULL));
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_completed_at_check"
    CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL);
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_time_order_check"
    CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");

COMMIT;
