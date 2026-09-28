import Link from "next/link";
import { getTodayCondition } from "@/lib/conditions/queries";
import { ConditionForm } from "@/components/conditions/condition-form";

export default async function ConditionPage() {
  const condition = await getTodayCondition();
  return <main className="mx-auto w-full max-w-[480px] space-y-5 px-4 py-5 text-slate-900">
    <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 active:text-slate-700">
      <span aria-hidden>←</span>ホーム
    </Link>
    <div>
      <h1 className="text-xl font-bold">今日のコンディション</h1>
      <p className="mt-1 text-sm text-slate-500">今日の状態を入力すると、あなたに合ったトレーニング提案に活用されます。</p>
    </div>
    <ConditionForm initial={condition} />
  </main>;
}
