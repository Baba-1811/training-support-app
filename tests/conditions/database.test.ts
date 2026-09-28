import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { expect, it } from "vitest";

// Opt-in (mirrors tests/workouts/database.test.ts): all fixtures stay inside one transaction and are rolled
// back, including on failure, so this never touches real data. Run with CONDITION_DB_TESTS=1 against DIRECT_URL.
it.skipIf(process.env.CONDITION_DB_TESTS !== "1")("enforces Daily Condition constraints and cascades in PostgreSQL", async () => {
  config({ quiet: true });
  const db = new Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    const user = randomUUID(), muscle = randomUUID(), otherMuscle = randomUUID(), condition = randomUUID(), muscleCondition = randomUUID();
    await db.query('INSERT INTO "User" (id,email,name,"trainingLevel","updatedAt") VALUES ($1,$2,$3,\'BEGINNER\',now())', [user, `${user}@example.invalid`, "Condition transaction test"]);
    await db.query('INSERT INTO "Muscle" (id,name,"updatedAt") VALUES ($1,$2,now())', [muscle, `Condition test muscle ${muscle}`]);
    await db.query('INSERT INTO "Muscle" (id,name,"updatedAt") VALUES ($1,$2,now())', [otherMuscle, `Condition test muscle ${otherMuscle}`]);

    const rejected = async (sql: string, params: unknown[], code: string) => {
      await db.query("SAVEPOINT invalid_input");
      try { await expect(db.query(sql, params)).rejects.toMatchObject({ code }); }
      finally { await db.query("ROLLBACK TO SAVEPOINT invalid_input"); }
    };

    // DailyCondition CHECK constraints.
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","sleepHours","updatedAt") VALUES ($1,$2,\'2026-09-28\',24.01,now())', [condition, user], "23514");
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","sleepHours","updatedAt") VALUES ($1,$2,\'2026-09-28\',-0.5,now())', [condition, user], "23514");
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","fatigueLevel","updatedAt") VALUES ($1,$2,\'2026-09-28\',0,now())', [condition, user], "23514");
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","fatigueLevel","updatedAt") VALUES ($1,$2,\'2026-09-28\',6,now())', [condition, user], "23514");
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","availableMinutes","updatedAt") VALUES ($1,$2,\'2026-09-28\',0,now())', [condition, user], "23514");

    await db.query('INSERT INTO "DailyCondition" (id,"userId","conditionDate","sleepHours","fatigueLevel","availableMinutes","updatedAt") VALUES ($1,$2,\'2026-09-28\',7.5,3,60,now())', [condition, user]);

    // One condition per (userId, conditionDate) per day.
    await rejected('INSERT INTO "DailyCondition" (id,"userId","conditionDate","updatedAt") VALUES ($1,$2,\'2026-09-28\',now())', [randomUUID(), user], "23505");

    // MuscleCondition CHECK (1-5, NOT NULL) and unique(dailyConditionId, muscleId).
    await rejected('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId","sorenessLevel") VALUES ($1,$2,$3,0)', [muscleCondition, condition, muscle], "23514");
    await rejected('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId","sorenessLevel") VALUES ($1,$2,$3,6)', [muscleCondition, condition, muscle], "23514");
    await rejected('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId") VALUES ($1,$2,$3)', [muscleCondition, condition, muscle], "23502");

    await db.query('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId","sorenessLevel") VALUES ($1,$2,$3,4)', [muscleCondition, condition, muscle]);
    await rejected('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId","sorenessLevel") VALUES ($1,$2,$3,2)', [randomUUID(), condition, muscle], "23505");

    // A second Muscle on the same DailyCondition is unrelated and fine.
    await db.query('INSERT INTO "MuscleCondition" (id,"dailyConditionId","muscleId","sorenessLevel") VALUES ($1,$2,$3,2)', [randomUUID(), condition, otherMuscle]);

    // Muscle is RESTRICT: cannot delete a Muscle a MuscleCondition still references.
    await rejected('DELETE FROM "Muscle" WHERE id=$1', [muscle], "23503");

    // DailyCondition -> MuscleCondition is CASCADE.
    await db.query('DELETE FROM "DailyCondition" WHERE id=$1', [condition]);
    expect((await db.query('SELECT count(*) FROM "MuscleCondition" WHERE "dailyConditionId"=$1', [condition])).rows[0].count).toBe("0");

    // User -> DailyCondition is CASCADE.
    await db.query('INSERT INTO "DailyCondition" (id,"userId","conditionDate","updatedAt") VALUES ($1,$2,\'2026-09-29\',now())', [condition, user]);
    await db.query('DELETE FROM "User" WHERE id=$1', [user]);
    expect((await db.query('SELECT count(*) FROM "DailyCondition" WHERE id=$1', [condition])).rows[0].count).toBe("0");
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
}, 30000);
