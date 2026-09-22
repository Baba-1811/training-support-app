import Link from "next/link";

export default function CheckEmailPage() {
  return <section className="w-full max-w-sm space-y-5 rounded-2xl border bg-white p-6">
    <h1 className="text-2xl font-bold">メールをご確認ください</h1>
    <p>登録を受け付けました。確認メールが届いた場合は、リンクを開いて登録を完了してください。</p>
    <p className="text-sm text-slate-600">届かない場合は迷惑メールフォルダをご確認ください。登録済みの方はログインしてください。</p>
    <Link href="/login" className="block py-3 text-blue-700 underline">ログインへ</Link>
  </section>;
}
