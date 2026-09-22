"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, reportProfileFailure } from "@/lib/auth/profile";
import { appUrl } from "@/lib/auth/app-url";
import { loginSchema, signupSchema, type AuthState } from "@/lib/auth/validation";

export async function signup(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient(true);
  const { email, password, name } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name }, emailRedirectTo: appUrl() + "/auth/confirm" },
  });
  if (error) return { error: "登録を完了できませんでした。入力内容を確認し、時間をおいてお試しください。" };
  // Duplicate signup may return an obfuscated user with no identities.
  if (data.user?.identities?.length) {
    try {
      await ensureProfile(data.user);
    } catch {
      reportProfileFailure();
      // No shared transaction. A verified confirmation/login retries by UUID.
      // Keep Auth intact; never compensate by deleting an account.
    }
  }
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  redirect("/check-email");
}
export async function login(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient(true);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "ログインできませんでした。メール・パスワードとメール確認の完了をご確認ください。" };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "認証情報を確認できませんでした。もう一度お試しください。" };
  if (!user.email_confirmed_at) redirect("/check-email");
  try {
    await ensureProfile(user, true);
  } catch {
    reportProfileFailure();
    redirect("/auth/profile-error");
  }
  revalidatePath("/", "layout");
  redirect("/");
}
export async function logout(...args: [AuthState, FormData]): Promise<AuthState> {
  void args;
  const supabase = await createClient(true);
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { error: "ログアウトできませんでした。もう一度お試しください。" };
  revalidatePath("/", "layout");
  redirect("/login");
}
