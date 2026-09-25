import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_TABS, activeNavTab } from "@/lib/navigation";
import { splitInProgress } from "@/lib/workouts/in-progress";

// Every route the shell links to (or keeps for deep links) must still have a page inside the protected group.
const page = (route: string) => join(process.cwd(), "app", "(protected)", ...route.split("/").filter(Boolean), "page.tsx");

describe("bottom navigation tabs", () => {
  it("has exactly four tabs: ホーム / トレーニング / 食事 / 設定", () => {
    expect(NAV_TABS.map((tab) => [tab.href, tab.label])).toEqual([
      ["/", "ホーム"], ["/workouts", "トレーニング"], ["/nutrition", "食事"], ["/settings", "設定"],
    ]);
  });

  it("has no separate 記録 / 分析 / 履歴 tab", () => {
    const labels = NAV_TABS.map((tab) => tab.label);
    for (const removed of ["記録", "分析", "履歴"]) expect(labels).not.toContain(removed);
  });

  it("links only to routes that exist", () => {
    for (const tab of NAV_TABS) expect(existsSync(page(tab.href)), tab.href).toBe(true);
  });

  it("keeps /analytics, /history and the workout detail routes (deep links) alive", () => {
    for (const route of ["/analytics", "/history", "/workouts/[id]"]) expect(existsSync(page(route)), route).toBe(true);
  });
});

describe("activeNavTab", () => {
  it.each(["/workouts", "/workouts/33333333-3333-4333-8333-333333333333", "/analytics", "/history"])(
    "%s highlights トレーニング", (pathname) => expect(activeNavTab(pathname)).toBe("training"));

  it.each([["/", "home"], ["/nutrition", "nutrition"], ["/settings", "settings"]] as const)(
    "%s highlights %s", (pathname, tab) => expect(activeNavTab(pathname)).toBe(tab));

  it("does not match a route that merely shares a prefix", () => {
    expect(activeNavTab("/workoutsx")).toBeNull();
    expect(activeNavTab("/historyfoo")).toBeNull();
    expect(activeNavTab("/login")).toBeNull();
  });
});

const workout = (id: string, startedAt: string) => ({ id, title: null, startedAt });

// Home and the training page use this to choose between "トレーニングを続ける" and "トレーニングを始める".
describe("splitInProgress (resume vs start CTA)", () => {
  it("has no current workout when nothing is in progress, so the start CTA is shown", () => {
    expect(splitInProgress([])).toEqual({ current: null, others: [] });
  });

  it("resumes the only in-progress workout", () => {
    const only = workout("a", "2026-09-24T01:00:00Z");
    expect(splitInProgress([only])).toEqual({ current: only, others: [] });
  });

  it("resumes the newest one and lists the rest, whatever the input order", () => {
    const oldest = workout("a", "2026-09-20T01:00:00Z");
    const newest = workout("b", "2026-09-24T01:00:00Z");
    const middle = workout("c", "2026-09-22T01:00:00Z");
    expect(splitInProgress([oldest, newest, middle])).toEqual({ current: newest, others: [middle, oldest] });
  });

  it("never drops a workout (nothing is deleted or completed)", () => {
    const list = [workout("a", "2026-09-20T01:00:00Z"), workout("b", "2026-09-24T01:00:00Z"), workout("c", "2026-09-22T01:00:00Z")];
    const { current, others } = splitInProgress(list);
    expect([current, ...others].map((item) => item?.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not mutate its input", () => {
    const list = [workout("a", "2026-09-20T01:00:00Z"), workout("b", "2026-09-24T01:00:00Z")];
    splitInProgress(list);
    expect(list.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
