import { requireUser } from "@/lib/auth/require-user";

// Placeholder only: no form, no numbers and no sample data until nutrition is actually built.
export default async function NutritionPage() {
  await requireUser();
  return <main className="mx-auto w-full max-w-[480px] px-4 py-5 text-slate-900">
    <h1 className="text-xl font-bold">食事</h1>
    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">準備中です</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        食事記録・PFC・摂取カロリーなどの管理機能を今後追加予定です。
      </p>
    </div>
  </main>;
}
