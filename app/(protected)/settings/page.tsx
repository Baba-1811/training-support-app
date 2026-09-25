import Image from "next/image";
import { requireUser } from "@/lib/auth/require-user";
import { LogoutButton } from "@/components/auth/logout-button";

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
    <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
    <dd className="min-w-0 break-all text-right text-sm font-medium text-slate-900">{value}</dd>
  </div>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section>
    <h2 className="mb-2 px-1 text-xs font-semibold text-slate-500">{title}</h2>
    <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</dl>
  </section>;
}

// Read-only for now: nothing here can be changed yet, so nothing is styled as an editable control.
export default async function SettingsPage() {
  const user = await requireUser();
  return <main className="mx-auto w-full max-w-[480px] space-y-6 px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">設定</h1>
    <Group title="アカウント">
      <Row label="ユーザー名" value={user.name} />
      <Row label="メールアドレス" value={user.email} />
    </Group>
    <Group title="トレーニング">
      <Row label="重量単位" value="kg" />
    </Group>
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold text-slate-500">LoopLift</h2>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Image src="/images/brand/app-icon.jpg" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-base font-bold">LoopLift</p>
          <p className="text-xs leading-snug text-slate-500">なんとなくの筋トレを、<wbr />成長が見えるトレーニングへ。</p>
        </div>
      </div>
    </section>
    <section aria-label="アカウント操作">
      <LogoutButton />
    </section>
  </main>;
}
