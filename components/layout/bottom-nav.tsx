"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NAV_TABS, activeNavTab, type NavTabId } from "@/lib/navigation";

const icon = (paths: ReactNode) => <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;

const ICONS: Record<NavTabId, ReactNode> = {
  home: icon(<><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>),
  training: icon(<><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></>),
  nutrition: icon(<><path d="M6 3v6a2 2 0 0 0 4 0V3M8 3v18" /><path d="M17 21V3c-2 1.5-3 4-3 7s1 4 3 4" /></>),
  settings: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>),
};

// Text-entry controls raise the on-screen keyboard; a fixed bar would then sit on top of the form being edited.
const isTextEntry = (target: EventTarget | null) => target instanceof HTMLTextAreaElement
  || (target instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "reset", "range", "file", "color"].includes(target.type));

export function BottomNav() {
  const active = activeNavTab(usePathname());
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(isTextEntry(event.target));
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => { document.removeEventListener("focusin", onFocusIn); document.removeEventListener("focusout", onFocusOut); };
  }, []);
  if (typing) return null;
  return <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_6px_rgba(15,23,42,0.05)]">
    <ul className="mx-auto grid max-w-[480px] grid-cols-4">
      {NAV_TABS.map((tab) => {
        const isActive = tab.id === active;
        return <li key={tab.id}>
          <Link href={tab.href} aria-current={isActive ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold leading-tight ${isActive ? "text-primary" : "text-slate-500 active:text-slate-700"}`}>
            {ICONS[tab.id]}
            <span className="whitespace-nowrap">{tab.label}</span>
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
