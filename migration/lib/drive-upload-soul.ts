/**
 * lib/drive-upload-soul.ts
 *
 * Google Drive へのアップロード結果をユーザー向けメッセージに変換する。
 * **必ず runSoulPipeline を通す**（Neo のトーン・免責・励ましを統一）。
 *
 * 実際の uploadFileToDrive() は lib/google-drive.ts。
 * OAuth トークン取得・user_integrations は呼び出し元（Server Action）で行う。
 */

import { runSoulPipeline, type SoulPipelineOutput } from '@/lib/soul-pipeline';
import type { GoogleDriveUploadResult } from '@/lib/google-drive';

export type DriveUploadFailureKind =
  | 'generic'
  /** Google が 401/403（権限取り消し・トークン不一致など） */
  | 'permission_or_auth'
  /** 先頭バイトと MIME の不一致・明らかな破損 */
  | 'invalid_magic_or_corrupt'
  /** 400 等（壊れた PDF 等で API が拒否） */
  | 'bad_request';

export interface FinalizeDriveUploadParams {
  userId:   string;
  fileName: string;
  upload:   GoogleDriveUploadResult;
  /** Supabase に保存したポインタ ID（任意・文面に触れる程度） */
  pointerId?: string;
  /** upload.ok が false のときの細分類（未指定は generic） */
  uploadFailureKind?: DriveUploadFailureKind;
}

/**
 * アップロード成功/失敗に応じた Neo 調メッセージ（Soul Pipeline 適用済み）
 */
export async function finalizeDriveUploadMessage(
  params: FinalizeDriveUploadParams,
): Promise<{ text: string; debug: SoulPipelineOutput['debug'] }> {
  const { userId, fileName, upload, uploadFailureKind = 'generic' } = params;

  const rawFailureGeneric =
    `Driveとのつながりが、いまひと息みたい…。保存を最後までやりきれなかったみたい。焦らず、下のフォームからもう一度ファイルを選んで試してみようか？同じところから続けられるよ。`;

  const rawFailureByKind: Record<DriveUploadFailureKind, string> = {
    generic:
      rawFailureGeneric,
    permission_or_auth:
      `Google Drive 側でこのアプリの保存が許可されていないみたい…。Google の設定で Neo+ のアクセスを止めている場合は、設定の「Google Driveを接続」からもう一度つなぎ直してから、もう一度アップロードを試してみよう。Neoはここにいるよ。`,
    invalid_magic_or_corrupt:
      `ファイルの中身が読み取れなかったみたい（形式が合っていないか、途中で壊れているかも）。別のファイルを選ぶか、エクスポートし直してから、もう一度試してみて。`,
    bad_request:
      `Google Drive がこのファイルの形を受け付けられなかったみたい。PDF が壊れている可能性もあるから、別のファイルや読み取り直したデータで試してみて。`,
  };

  const raw = upload.ok
    ? `「${fileName}」をGoogle DriveのNeo専用フォルダに、安全に保管したよ。` +
      `この内容で記帳も進めてよろしいでしょうか？（下の「記帳する」から確定できるよ。金額はあとからチャットで直しても大丈夫）`
    : rawFailureByKind[uploadFailureKind];

  const out = await runSoulPipeline({
    raw,
    userId,
    context: {
      alertLevel: upload.ok ? 'none' : 'warn',
    },
  });

  return { text: out.text, debug: out.debug };
}

export type DrivePrerequisiteKind =
  | 'not_linked'
  | 'refresh_failed'
  | 'folder_error'
  | 'session_error';

const PREREQUISITE_RAW: Record<DrivePrerequisiteKind, string> = {
  not_linked:
    'Google Drive との連携がまだみたい。コックピットか設定の「Google Driveを接続」から一度つなげてから、もう一度このチャットからアップロードしてみてね。',
  refresh_failed:
    'Driveとのつながりが、いまひと息みたい…。トークンの更新に失敗しちゃった。設定の「権限の再確認・再接続」から、もう一度つなぎ直してからアップロードを試してみよう。再接続できたら、またこのチャットのフォームからで大丈夫。',
  folder_error:
    'Neo用フォルダの準備で一瞬つまずいたみたい。少し時間をおいてから、もう一度アップロードしてみて。それでもうまくいかないときは、設定の「Google Driveを接続」から再接続してみてね。',
  session_error:
    'Driveとの接続を確認している途中で、ログインの状態が途切れたみたい。一度ページを更新してから、もう一度このチャットのフォームからアップロードを試してみよう。それでも続くときは、設定からログインし直してからね。',
};

/**
 * 連携未設定・トークン失効・フォルダ作成失敗など、**アップロード前**の案内（Soul 必須）
 */
export async function finalizeDrivePrerequisiteMessage(
  userId: string,
  kind: DrivePrerequisiteKind,
): Promise<{ text: string; debug: SoulPipelineOutput['debug'] }> {
  const raw = PREREQUISITE_RAW[kind];
  const out = await runSoulPipeline({
    raw,
    userId,
    context: { alertLevel: 'warn' },
  });
  return { text: out.text, debug: out.debug };
}
