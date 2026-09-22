"use client";

import { useActionState } from "react";
import { logout } from "@/app/(auth)/actions";

export function LogoutButton() {
  const [state, action, pending] = useActionState(logout, {});
  return <form action={action}>
    <button disabled={pending} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-60">
      {pending ? "処理中…" : "ログアウト"}
    </button>
    <p role="alert" className="mt-1 text-sm text-red-700">{state.error}</p>
  </form>;
}
