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

// The half-open instant range [start, end) covering one JST calendar day, for filtering a timestamptz column
// (e.g. BodyMeasurement.measuredAt) by "that JST day". `date` is a JST calendar date anchored at UTC midnight (what
// jstDateOnly() returns). JST midnight is 15:00Z of the previous UTC day, so the range is shifted back by 9h —
// a plain UTC-midnight bound would cut the JST day at 09:00 JST.
export function jstDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getTime() - JST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
