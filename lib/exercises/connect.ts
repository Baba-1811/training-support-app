import type { ActionResult } from "@/lib/workouts/types";

export type ConnectMode = "start" | "add";
type Failure = Extract<ActionResult<unknown>, { ok: false }>["code"];

// The workout actions answer generically ("記録が見つかりません。"); on the exercise page the cause is known, so say it plainly.
export function connectErrorMessage(mode: ConnectMode, code: Failure): string {
  switch (code) {
    case "VALIDATION": return "種目を確認できませんでした。ページを更新して再試行してください。";
    case "NOT_FOUND": return mode === "start"
      ? "この種目は現在利用できません。種目一覧から選び直してください。"
      : "進行中のトレーニングまたはこの種目が見つかりません。ページを更新して再試行してください。";
    case "INVALID_STATE": return "このトレーニングはすでに終了しています。ページを更新して再試行してください。";
    default: return mode === "start"
      ? "トレーニングを開始できませんでした。時間をおいて再試行してください。"
      : "種目を追加できませんでした。時間をおいて再試行してください。";
  }
}
