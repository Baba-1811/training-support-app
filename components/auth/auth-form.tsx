"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup } from "@/app/(auth)/actions";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState(isSignup ? signup : login, {});
  const title = isSignup ? "アカウントを作成" : "ログイン";
  return (
    <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-sm font-medium text-slate-500">Training Support</p>
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      <form action={action} className="space-y-5">
        {isSignup && <label className="block text-sm font-medium">
          表示名
          <input name="name" autoComplete="nickname" required maxLength={100}
            className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-blue-600" />
        </label>}
        <label className="block text-sm font-medium">
          メールアドレス
          <input name="email" type="email" autoComplete="email" inputMode="email" required maxLength={255}
            className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-blue-600" />
        </label>
        <label className="block text-sm font-medium">
          パスワード
          <input name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"}
            required minLength={isSignup ? 8 : 1} maxLength={128} aria-describedby={isSignup ? "password-help" : undefined}
            className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-blue-600" />
          {isSignup && <span id="password-help" className="mt-1 block text-xs text-slate-500">8〜128文字で入力してください。</span>}
        </label>
        <p role="alert" aria-live="polite" className="text-sm text-red-700">{state.error}</p>
        <button disabled={pending} className="min-h-12 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:opacity-60">
          {pending ? "処理中…" : title}
        </button>
      </form>
      <Link className="mt-6 block py-2 text-center text-sm text-blue-700 underline" href={isSignup ? "/login" : "/signup"}>
        {isSignup ? "アカウントをお持ちの方はログイン" : "新規登録はこちら"}
      </Link>
    </section>
  );
}
