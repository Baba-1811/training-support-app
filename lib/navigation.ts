// Bottom navigation route design. Kept free of React so the tab <-> route mapping can be tested on its own.
export type NavTabId = "home" | "training" | "nutrition" | "settings";

export const NAV_TABS: ReadonlyArray<{ id: NavTabId; href: string; label: string }> = [
  { id: "home", href: "/", label: "ホーム" },
  { id: "training", href: "/workouts", label: "トレーニング" },
  { id: "nutrition", href: "/nutrition", label: "食事" },
  { id: "settings", href: "/settings", label: "設定" },
];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

// Workouts, analytics and history are one "training" area for the user; /analytics and /history stay reachable
// by URL but no longer have tabs of their own.
export function activeNavTab(pathname: string): NavTabId | null {
  if (pathname === "/") return "home";
  if (under(pathname, "/workouts") || under(pathname, "/analytics") || under(pathname, "/history")) return "training";
  if (under(pathname, "/nutrition")) return "nutrition";
  if (under(pathname, "/settings")) return "settings";
  return null;
}
