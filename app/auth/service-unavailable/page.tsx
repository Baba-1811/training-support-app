import Link from "next/link";

// Reached when Supabase's Auth API itself could not be reached or is rate-limited (429/5xx), not when the
// visitor is actually signed out — see lib/auth/classify-error.ts. Deliberately not "you are logged out":
// the session may still be valid once the Auth API recovers, and this page never claims otherwise.
export default function AuthServiceUnavailablePage() {
  return <>
    <h1 className="text-xl font-bold">認証サービスが混み合っています</h1>
    <p>少し時間をおいてから再度お試しください。ログイン情報が失われたわけではありません。</p>
    <Link prefetch={false} className="block rounded-lg bg-blue-700 px-4 py-3 text-center text-white" href="/">再試行</Link>
  </>;
}
