import { requireUser } from "@/lib/auth/require-user";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="min-h-dvh bg-slate-50 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
      <span className="break-all text-sm">{user.name}さん</span>
      <LogoutButton />
    </header>
    {children}
  </div>;
}
