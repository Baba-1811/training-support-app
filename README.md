# Training Support

Next.js 16 App Router / Prisma 7 / PostgreSQL / Supabase Auth のトレーニング支援アプリです。

## ローカル設定

1. `npm ci`
2. `.env.example`の項目を既存の`.env`または`.env.local`に追加します。既存のDB接続設定を上書きしないでください。
3. `NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`をSupabase DashboardのConnectから取得します。service role / secret keyは不要です。
4. `APP_URL=http://localhost:3000`を設定します。本番は公開先のHTTPS URLを指定します。
5. Prisma Client未生成の場合は`npx prisma generate --config prisma7.config.ts`を実行します。認証実装にDB migrationは不要です。
6. `npm run dev`

Prisma CLIの設定名は既存の`prisma7.config.ts`を維持しています。CLIでは`--config prisma7.config.ts`を指定してください。CLIのdotenvは通常`.env.local`を読みません。DB変数は既存の`.env`または実行環境で設定します。

## Supabase Auth設定（必須）

- Email/password認証を有効にし、**Confirm emailを有効**にします。
- Site URLを`APP_URL`と一致させます。
- Redirect URLsに`http://localhost:3000/auth/confirm`と本番の同パスを登録します。
- **確認メールのテンプレート変更は不要です。** Supabaseのデフォルトメール（`{{ .ConfirmationURL }}`）のまま動作します。

### メール確認の仕組み（PKCE）

`@supabase/ssr`はPKCEフローを使います。デフォルトの確認メールのリンクは次の順に処理されます。

1. `signUp`時に、ブラウザのCookieへ`code_verifier`が保存されます（サインアップしたブラウザに紐づきます）。
2. リンクはSupabaseの`/auth/v1/verify`に届き、そこでメール確認が完了します（Dashboardの Confirmed at）。
3. `APP_URL/auth/confirm?code=...`へリダイレクトされます。
4. `app/auth/confirm/route.ts`が`exchangeCodeForSession(code)`でセッションを確立し、`getUser()`でAuthサーバーの検証と`email_confirmed_at`を確認してから`ensureProfile(user, true)`を実行します。

`code`の交換にはサインアップ時のCookieが必要です。**確認リンクを登録時と別のブラウザ・別端末で開くと、Supabase側の確認は完了していても交換に失敗し`/auth/error`になります。** この場合はログインすれば利用できます。同じブラウザで再度サインアップすると古いメールのリンクは無効になります（最新のメールのみ有効）。メールのセキュリティスキャナーが先にリンクを開いた場合も同様にログインで復旧できます。

`/auth/confirm`は次の2種類のリンクだけを受け付け、`code`と`token_hash`が同時にある場合、`error`/`error_code`付きのリダイレクト、その他は`/auth/error`にします。

- `?code=...`（現在の標準。デフォルトメール）
- `?token_hash=...&type=email`（カスタムSMTPでテンプレートを編集した場合の任意の方式。テンプレートのリンクは`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`）

どちらの方式でもURLのユーザーIDやメールは信用せず、Authサーバーで検証したユーザーだけを`ensureProfile`に渡します。

開発・本番でSupabaseプロジェクトを分け、Site URLをそれぞれに設定します。デフォルトSMTPはメール配信数の制限が厳しいため、本番ではカスタムSMTPを設定してください。

このアプリはPrismaで業務データにアクセスします。Supabase Data APIを使わない場合は無効化してください。有効な場合は公開スキーマの権限とRLSを別途設定し、anon/authenticatedロールから業務データを直接読み書きできないことを確認してください。Next.jsの認証だけではData APIを保護できません。

## 認証とデータの責務

- `app/(auth)/actions.ts`: Zod検証後にsignup/login/logout。ユーザーIDをフォームから受け取りません。
- `app/auth/confirm/route.ts`: PKCEの`code`（または`token_hash`）を検証してCookieを設定し、`getUser`で再検証したユーザーだけを`ensureProfile`に渡します。遷移先は固定で外部URLを受け付けません。
- `proxy.ts`: getClaimsで検証・更新し、request/response双方にCookieを反映。静的ファイル以外を対象とし、公開ルートを明示。
- `lib/auth/require-user.ts`: getUserで再検証し、メール確認とUser整合性を確認。Reactのcacheは同一レンダリング内の重複処理抑制だけに使用。
- `/`は認証必須。layoutとページ自身の両方でrequireUserを呼びます。
- `lib/supabase/client.ts`はブラウザでAuthを利用する場合の共通クライアントです。現在のフォーム送信はServer Actionで処理します。
- 個人データ取得・更新では、必ず`const user = await requireUser()`で得たIDを所有者条件に使います。例: `where: { id: recordId, userId: user.id }`。子テーブルは親の所有者までrelation条件で確認します。
- 現在のExercise一覧は全ユーザー共通のマスターデータでuserIdがなく、ログイン確認後に取得します。
- CookieはSSRパッケージが管理。productionではSecure、SameSite=Lax。認証レスポンスの共有キャッシュを禁止します。JWTはログアウト後も有効期限まで利用される可能性があるため、即時の全トークン失効は保証しません。
- パスワード、トークン、接続文字列をアプリログに記録しません。

## User作成と不整合からの復旧

既存schemaは変更していません。`User.id`はSupabaseのUUIDを明示指定します。`@default(uuid())`は残っていますが、認証コードでは使いません。email、trainingLevel等の既存設計を維持し、初期trainingLevelはBEGINNERです。

1. signUp成功時、新規ユーザーのAuth応答からUserを作成します。
2. 重複登録でidentitiesが空（または省略）ならUserを作成・更新しません。新規で省略された場合も、次の本人確認済み処理で補完できます。
3. Auth成功後にDBが失敗してもAuthユーザーを削除せず、確認メール案内を表示します。
4. メール確認・ログイン・保護ページアクセスで、getUserから得た本人確認済みUUIDを使って不足するUserを再作成します。
5. 復旧に失敗したら`/auth/profile-error`へ遷移し、業務データを返しません。再試行とログアウトが可能です。
6. 同時リクエストによる作成競合では、同じUUID/emailの既存行だけを採用します。プロフィール名・trainingLevelはログイン時に上書きしません。
7. emailは検証済みAuthユーザーから同期します。別UUIDとのemail一意制約違反は自動連結せず、アクセスを止めます。

安全なエラーログは`AUTH_PROFILE_SYNC_FAILED`です。繰り返す場合、管理者がDB接続状況とAuth UUID / User UUID / email重複を確認します。既存の独自UUIDのUserをメール一致だけで自動移行しません。手動対応では本人確認・バックアップと関連記録の確認が必要です。

Auth APIとPrismaの処理は単一トランザクションではありません。DBトリガー・FKがないため、管理画面でのAuth削除にUser削除は追従しません。Authに存在しないユーザーはgetUserで拒否しますが、孤立したプロフィールの整理は管理者が行います。未確認ユーザーの残存・退会時のデータ削除・認証基盤外からのUser作成も自動整合性の保証範囲外です。今回、退会機能・管理者用修復APIは追加していません。

**開発中にユーザーをリセットする場合の注意:** Dashboardで**Authユーザーだけを削除しない**でください。対応する`public.User`と関連データ（トレーニング記録など）も、整合性に注意して一緒に削除します。`public.User`だけが残ると、同じメールアドレスで新規登録・ログインした際に`User.email`の一意制約に衝突し、`/auth/profile-error`から進めなくなります（別UUIDとのメール一致では自動連結しないため）。

将来の退会機能では、AuthユーザーとアプリDBのデータを整合性を保って削除する設計を別途行います。

## 検証

```sh
npm run lint
npm run typecheck
npm test
```

テストはSupabase/Prismaをモックし、入力検証・UUID所有者条件・二重登録・作成競合・DB失敗からの再試行・メール確認（`code`/`token_hash`）・ログアウト・保護処理・Cookie更新を検証します。`tests/auth/pkce.test.ts`は実際の`@supabase/ssr`クライアント（fetchとCookieストアのみ差し替え）で、signUpのverifier Cookie保存、`?code=`の交換、別ブラウザ（Cookieなし）での失敗を検証します。実際のメール送信やSupabaseプロジェクトの権限設定までは検証しません。

実環境設定後の確認項目:

1. スマートフォン幅で新規登録 → 確認メール（デフォルトのまま）→ 確認リンクを**同じブラウザで**開く → 種目一覧。別ブラウザで開いた場合は`/auth/error`が表示され、ログインできること。
2. DBでAuthとUserのUUID一致、name/email/trainingLevelを確認。
3. ログアウト後の直接URLアクセス・再読み込みでログイン画面へ戻る。
4. 誤パスワード、重複登録、期限切れ/使用済み確認リンク、未確認ログインを確認。
5. アクセストークン更新後にもログイン状態が維持されること、レスポンスがno-storeであることを確認。
6. テスト専用環境でDB失敗を再現し、復旧後のログインでUserを作成できることを確認。
7. 別UUIDのemail衝突で既存データが連結されないこと、Data APIで業務データを直接読めないことを確認。

テスト用Authアカウントの作成は実際にメール送信とDB書き込みを伴います。開発用プロジェクトと自分のメールアドレスを使用してください。
