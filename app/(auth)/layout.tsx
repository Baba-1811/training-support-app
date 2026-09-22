export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">{children}</main>;
}
