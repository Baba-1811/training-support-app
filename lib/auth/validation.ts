import { z } from "zod";
const email = z.string().trim().email("メールアドレスを確認してください。").max(255);
export const nameSchema = z.string().trim().min(1, "表示名を入力してください。").max(100, "表示名は100文字以内で入力してください。");
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "パスワードを入力してください。").max(128),
});
export const signupSchema = loginSchema.extend({
  name: nameSchema,
  password: z.string().min(8, "パスワードは8文字以上で入力してください。").max(128, "パスワードは128文字以内で入力してください。"),
});
export type AuthState = { error?: string };
