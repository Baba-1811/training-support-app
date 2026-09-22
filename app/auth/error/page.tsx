import Link from "next/link";

export default function ConfirmationErrorPage() {
  return <>
    <h1 className="text-xl font-bold">メール確認を完了できませんでした</h1>
    <p>メールアドレスの確認自体は完了している可能性があります。まずログインをお試しください。</p>
    <p className="text-sm text-slate-600">確認リンクを登録時と別のブラウザや端末で開いた場合、リンクの期限が切れた場合、または一度使用したリンクを開いた場合に、この画面が表示されることがあります。ログインできない場合は、同じメールアドレスで新規登録を再度お試しください。</p>
    <Link className="block py-2 text-blue-700 underline" href="/login">ログインへ</Link>
    <Link className="block py-2 text-blue-700 underline" href="/signup">新規登録へ</Link>
  </>;
}
