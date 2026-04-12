/**
 * ユーザーが保留アクションの「実行」を意図した発話か（サーバー・クライアント共通）
 *
 * 自然言語のバリエーションを許容しつつ、
 * - 短文の「はい」単体は完全一致のみ（会話中の誤爆を減らす）
 * - プロンプトインジェクション風の長文は拒否
 * - 長文では「実行して」等の明示フレーズを要求
 */

/** ドキュメント・UI ヒント用（承認例） */
export const APPROVAL_PHRASE_EXAMPLES = [
  '実行して',
  '登録して',
  '進めて',
  '進めてください',
  '確定して',
  'お願いします',
  'そのまま進めて',
  'OK',
  'はい',
  'よろしく',
] as const;

/** 承認と偽装しやすい「指示上書き」系（誤検知より安全側） */
const INJECTION_OR_OVERRIDE_MARKERS =
  /(ignore\s+(previous|all)|無視して|前の指示|system\s*prompt|開発者向け|override|脱獄|jailbreak|DAN\b|仮想|シミュレート)/i;

/** 明示的な実行意図（長文ではいずれか必須） */
const EXPLICIT_APPROVAL_IN_LONG =
  /実行して|実行します|登録して|登録お願い|登録をお願い|確定して|進めて|進めてください|お願いします|そのまま進めて|やってください|やります/;

export function isConfirmExecutionMessage(message: string): boolean {
  const t = message.trim().replace(/[。．!！?？\s]+$/g, '');
  if (t.length === 0 || t.length > 96) return false;

  if (INJECTION_OR_OVERRIDE_MARKERS.test(t)) {
    return false;
  }

  // 長文は「承認フレーズ」が文中に明確に含まれること（短い誤爆だけ許容しない）
  if (t.length > 72) {
    return EXPLICIT_APPROVAL_IN_LONG.test(t);
  }

  // 長めの文に含まれる典型的な承認フレーズ（部分一致）
  if (
    /実行して|実行します|進めて|進めてください|登録して|登録お願い|登録をお願い|確定して|お願いします|そのまま進めて|やってください|やります/.test(
      t,
    )
  ) {
    return true;
  }

  // 短い承認（完全一致・誤爆しにくいもの）
  if (
    /^(はい|OK|お願い|よろしく|いいよ|了解|そうして|うん|実行)$/i.test(t)
  ) {
    return true;
  }

  return false;
}
