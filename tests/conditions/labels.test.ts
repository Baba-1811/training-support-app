import { describe, expect, it } from "vitest";
import { fatigueLabel, formatAvailableMinutes, formatSleepHours, sorenessLabel } from "@/lib/conditions/labels";

describe("fatigueLabel", () => {
  it.each([
    [1, "元気"], [2, "少し疲れている"], [3, "普通"], [4, "疲れている"], [5, "かなり疲れている"],
  ] as const)("%s -> %s (higher = more fatigued)", (level, label) => expect(fatigueLabel(level)).toBe(label));
  it("shows — for no value", () => expect(fatigueLabel(null)).toBe("—"));
});

describe("sorenessLabel", () => {
  it.each([
    [1, "わずか"], [2, "軽い"], [3, "あり"], [4, "強い"], [5, "かなり強い"],
  ] as const)("%s -> %s (higher = more soreness)", (level, label) => expect(sorenessLabel(level)).toBe(label));
});

describe("formatSleepHours", () => {
  it.each([["7", "7.0h"], ["7.5", "7.5h"], ["0", "0.0h"]])("%s -> %s", (hours, formatted) => expect(formatSleepHours(hours)).toBe(formatted));
  it("shows — for no value", () => expect(formatSleepHours(null)).toBe("—"));
});

describe("formatAvailableMinutes", () => {
  it.each([[30, "30分"], [60, "60分"], [90, "90分"]])("%s -> %s", (minutes, formatted) => expect(formatAvailableMinutes(minutes)).toBe(formatted));
  it("shows — for no value", () => expect(formatAvailableMinutes(null)).toBe("—"));
});
