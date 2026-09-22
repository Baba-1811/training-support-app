export default function AuthStatusLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <section className="w-full max-w-sm space-y-5 rounded-2xl border bg-white p-6">{children}</section>
  </main>;
}
