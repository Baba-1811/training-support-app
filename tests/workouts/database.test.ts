import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { expect, it } from "vitest";

// Opt-in: all fixtures stay inside one transaction and are rolled back, including on failure.
it.skipIf(process.env.WORKOUT_DB_TESTS !== "1")("enforces workout constraints and cascades in PostgreSQL", async () => {
  config({ quiet: true });
  const db = new Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    const user = randomUUID(), exercise = randomUUID(), session = randomUUID(), entry = randomUUID(), set = randomUUID();
    await db.query('INSERT INTO "User" (id,email,name,"trainingLevel","updatedAt") VALUES ($1,$2,$3,\'BEGINNER\',now())', [user, `${user}@example.invalid`, "Workout transaction test"]);
    await db.query('INSERT INTO "Exercise" (id,name,"equipmentType","updatedAt") VALUES ($1,$2,\'BARBELL\',now())', [exercise, `Workout test ${exercise}`]);
    await db.query('INSERT INTO "WorkoutSession" (id,"userId","startedAt","updatedAt") VALUES ($1,$2,now(),now())', [session, user]);
    await db.query('INSERT INTO "WorkoutExercise" (id,"workoutSessionId","exerciseId","exerciseOrder") VALUES ($1,$2,$3,1)', [entry, session, exercise]);
    const defaults = await db.query('SELECT title,status,"completedAt" FROM "WorkoutSession" WHERE id=$1', [session]);
    expect(defaults.rows[0]).toMatchObject({ title: null, status: "IN_PROGRESS", completedAt: null });
    expect((await db.query('SELECT count(*) FROM "WorkoutSet" WHERE "workoutExerciseId"=$1', [entry])).rows[0].count).toBe("0");
    const rejected = async (sql: string, params: unknown[], code: string) => {
      await db.query("SAVEPOINT invalid_input");
      try { await expect(db.query(sql, params)).rejects.toMatchObject({ code }); }
      finally { await db.query("ROLLBACK TO SAVEPOINT invalid_input"); }
    };
    await rejected('INSERT INTO "WorkoutSet" (id,"workoutExerciseId","setNumber","weightKg",reps,rir) VALUES ($1,$2,1,60,10,10.1)', [set, entry], "23514");
    await rejected('INSERT INTO "WorkoutSet" (id,"workoutExerciseId","setNumber","weightKg",reps,completed) VALUES ($1,$2,1,60,10,true)', [set, entry], "23514");
    await rejected('INSERT INTO "WorkoutSet" (id,"workoutExerciseId","setNumber","weightKg",reps,completed,"completedAt") VALUES ($1,$2,1,60,0,true,now())', [set, entry], "23514");
    await rejected('INSERT INTO "WorkoutSet" (id,"workoutExerciseId","setNumber","weightKg",reps) VALUES ($1,$2,1,NULL,10)', [set, entry], "23502");
    await rejected('UPDATE "WorkoutSession" SET status=\'COMPLETED\' WHERE id=$1', [session], "23514");
    await rejected('UPDATE "WorkoutSession" SET "completedAt"="startedAt"-interval \'1 second\' WHERE id=$1', [session], "23514");
    await db.query('INSERT INTO "WorkoutSet" (id,"workoutExerciseId","setNumber","weightKg",reps,completed,"completedAt") VALUES ($1,$2,3,60,10,true,now())', [set, entry]);
    await db.query('INSERT INTO "FavoriteExercise" ("userId","exerciseId") VALUES ($1,$2)', [user, exercise]);
    await rejected('INSERT INTO "FavoriteExercise" ("userId","exerciseId") VALUES ($1,$2)', [user, exercise], "23505");
    await db.query('DELETE FROM "WorkoutExercise" WHERE id=$1', [entry]);
    expect((await db.query('SELECT count(*) FROM "WorkoutSet" WHERE id=$1', [set])).rows[0].count).toBe("0");
    await db.query('DELETE FROM "User" WHERE id=$1', [user]);
    expect((await db.query('SELECT count(*) FROM "FavoriteExercise" WHERE "userId"=$1', [user])).rows[0].count).toBe("0");
    expect((await db.query('SELECT count(*) FROM "WorkoutSession" WHERE id=$1', [session])).rows[0].count).toBe("0");
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
}, 30000);
