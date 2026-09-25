import { requireUser } from "@/lib/auth/require-user";
import { BottomNav } from "@/components/layout/bottom-nav";

export const dynamic = "force-dynamic";

// LoopLift app shell: page content (each page centers itself in a 480px column) above a fixed bottom navigation.
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-dvh bg-slate-50 text-slate-900">
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
    <BottomNav />
  </div>;
}
