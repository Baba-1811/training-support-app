import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";

export default function ProfileErrorPage() {
  return <>
    <h1 className="text-xl font-bold">プロフィールを準備できませんでした</h1>
    <p>認証後のデータ準備に失敗しました。アカウントを作り直す必要はありません。時間をおいて再試行してください。</p>
    <p className="text-sm text-slate-600">繰り返し失敗する場合は、管理者にプロフィールの確認を依頼してください。</p>
    <Link prefetch={false} className="block rounded-lg bg-blue-700 px-4 py-3 text-center text-white" href="/">再試行</Link>
    <LogoutButton />
  </>;
}
