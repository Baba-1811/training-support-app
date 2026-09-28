// Asia/Tokyo "today", independent of the server's own timezone (e.g. Vercel runs in UTC). JST has no DST,
// so a fixed +9h offset is exact (same assumption already used by lib/workouts/analytics-trend.ts).
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// The JST calendar date of `now`, as a Date at UTC midnight. Prisma writes a `@db.Date` field from the UTC
// instant it is given, so anchoring at UTC midnight of the JST date is what makes the stored DATE match the
// JST calendar day exactly, with no further timezone shift happening in Prisma/Postgres.
export function jstDateOnly(now: Date = new Date()): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}
