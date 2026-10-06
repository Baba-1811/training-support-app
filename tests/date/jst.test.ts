import { describe, expect, it } from "vitest";
import { jstDateOnly, jstDayRange } from "@/lib/date/jst";

describe("jstDayRange", () => {
  const date = new Date("2026-09-28T00:00:00.000Z");

  it("spans JST midnight to the next JST midnight (15:00Z to 15:00Z), not UTC midnight", () => {
    const { start, end } = jstDayRange(date);
    expect(start.toISOString()).toBe("2026-09-27T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-28T15:00:00.000Z");
  });

  it("is half-open: 00:00 JST belongs to the day, the next 00:00 JST does not", () => {
    const { start, end } = jstDayRange(date);
    const jstMidnight = new Date("2026-09-27T15:00:00Z"); // 2026-09-28 00:00 JST
    const lastMoment = new Date("2026-09-28T14:59:59.999Z"); // 2026-09-28 23:59:59.999 JST
    const nextMidnight = new Date("2026-09-28T15:00:00Z"); // 2026-09-29 00:00 JST
    expect(jstMidnight >= start && jstMidnight < end).toBe(true);
    expect(lastMoment >= start && lastMoment < end).toBe(true);
    expect(nextMidnight < end).toBe(false);
  });

  it("round-trips with jstDateOnly", () => {
    const { start } = jstDayRange(jstDateOnly(new Date("2026-09-27T15:30:00Z")));
    expect(start.toISOString()).toBe("2026-09-27T15:00:00.000Z");
  });
});

const iso = (date: Date) => date.toISOString();

describe("jstDateOnly", () => {
  it("keeps the same calendar date when UTC and JST agree (midday)", () => {
    expect(iso(jstDateOnly(new Date("2026-09-28T05:00:00Z")))).toBe("2026-09-28T00:00:00.000Z");
  });

  it("rolls over to the next JST day just after 23:00 JST (UTC still the previous day)", () => {
    // 2026-09-27T15:30:00Z = 2026-09-28T00:30:00+09:00
    expect(iso(jstDateOnly(new Date("2026-09-27T15:30:00Z")))).toBe("2026-09-28T00:00:00.000Z");
  });

  it("is still the previous JST day just before the rollover (23:59 JST)", () => {
    // 2026-09-27T14:59:00Z = 2026-09-27T23:59:00+09:00
    expect(iso(jstDateOnly(new Date("2026-09-27T14:59:00Z")))).toBe("2026-09-27T00:00:00.000Z");
  });

  it("is the next JST day right at the rollover (00:00 JST)", () => {
    // 2026-09-27T15:00:00Z = 2026-09-28T00:00:00+09:00
    expect(iso(jstDateOnly(new Date("2026-09-27T15:00:00Z")))).toBe("2026-09-28T00:00:00.000Z");
  });

  it("does not depend on the server's own timezone (only on the instant given)", () => {
    const instant = new Date("2026-09-27T15:30:00Z");
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(iso(jstDateOnly(instant))).toBe("2026-09-28T00:00:00.000Z");
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("returns a UTC-midnight Date (safe to hand to a Prisma @db.Date field with no further shift)", () => {
    const result = jstDateOnly(new Date("2026-09-28T05:00:00Z"));
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
