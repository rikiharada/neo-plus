/**
 * features/drive/actions.ts
 * Google Drive Zero-Server — アップロード・ポインタ保存・Soul Pipeline 必須
 *
 * 成功時は **収支を自動登録せず** `pendingDriveConfirmation` でクライアントが `insertActivity` を選べるようにする（Agentic 確認）。
 */

'use server';

import {
  requireAuth,
  handleServerActionError,
  createServerActionClient,
  isNextRedirectError,
} from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import {
  finalizeDriveUploadMessage,
  finalizeDrivePrerequisiteMessage,
  type DrivePrerequisiteKind,
  type DriveUploadFailureKind,
} from '@/lib/drive-upload-soul';
import { validateDeclaredMimeMagic } from '@/lib/drive-file-signature';
import {
  deleteDriveFile,
  uploadFileToDrive,
  type GoogleDriveUploadResult,
} from '@/lib/google-drive';
import { getValidGoogleDriveAccessForUser } from '@/lib/drive-user-access';
import { DriveUploadKindSchema, type DriveUploadKind } from '@/lib/validation';
import { runSoulPipeline } from '@/lib/soul-pipeline';
import type {
  DriveUploadSoulResult,
  PendingDriveConfirmation,
  SuggestedActivityDraft,
  UploadToDriveResult,
} from './drive-types';

// ─── 定数 ────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

// ─── 既存: アップロード結果だけ Soul する（テスト・二段階 UI 用） ───

/**
 * 「あとで」: 保留バナーを閉じ、記帳は行わない。Drive 上のファイルはそのまま残す。
 * 同じ会話内で再アップロードすれば、再度バナーが出る。
 */
export async function dismissDrivePendingMessage(fileName?: string): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  code?: string;
}> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`drive:dismiss:${user.id}`, RATE_LIMIT_PRESETS.driveSoulMessage);

    const raw = fileName?.length
      ? `「${fileName.slice(0, 200)}」の記帳は、いまは保留にしておいたよ。ファイル自体は Google Drive に残っているから安心してね。あとから記帳するときは、チャット上のフォームからもう一度アップロードして、この確認を出してもらえれば大丈夫。`
      : '記帳は、いまは保留にしておいたよ。ファイルは Google Drive に残っているから安心してね。あとからは、チャットのフォームからもう一度アップロードして確認してね。';

    const soul = await runSoulPipeline({
      raw,
      userId: user.id,
      context: { alertLevel: 'info' },
    });
    return { ok: true, message: soul.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

export async function buildDriveUploadAssistantMessage(input: {
  fileName: string;
  upload:   GoogleDriveUploadResult;
}): Promise<DriveUploadSoulResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`drive:soul:${user.id}`, RATE_LIMIT_PRESETS.driveSoulMessage);

    const out = await finalizeDriveUploadMessage({
      userId:   user.id,
      fileName: input.fileName,
      upload:   input.upload,
    });

    return {
      ok:      true,
      message: out.text,
      _debug:  process.env.NODE_ENV === 'development' ? { soul: out.debug } : undefined,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── メイン: アップロード → Drive → ポインタ保存 → Soul ─────────────

/**
 * Zero-Server 完全フロー:
 * 1) FormData の `file` を Neo 専用フォルダへアップロード
 * 2) `drive_file_pointers` にメタデータのみ保存
 * 3) `finalizeDriveUploadMessage`（runSoulPipeline 必須）
 * 4) **収支 insert は行わず** `pendingDriveConfirmation` を返す
 */
export async function uploadToDriveAndCreateActivity(
  formData: FormData,
): Promise<UploadToDriveResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`drive:upload:${user.id}`, RATE_LIMIT_PRESETS.driveFileUpload);

    const file = formData.get('file');
    if (!(file instanceof File)) {
      const soul = await runSoulPipeline({
        raw:
          'ファイルがうまく受け取れなかったみたい。もう一度、ファイルを選んでアップロードしてみて。',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }

    const kindRaw = formData.get('kind');
    const kindParsed = DriveUploadKindSchema.safeParse(
      typeof kindRaw === 'string' && kindRaw.length > 0 ? kindRaw : 'receipt',
    );
    if (!kindParsed.success) {
      const soul = await runSoulPipeline({
        raw:
          '送り方に少し問題がありそう。種類の指定を確認して、もう一度ファイルを選んで試してみて。',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }
    const kind = kindParsed.data;

    if (file.size > MAX_UPLOAD_BYTES) {
      const soul = await runSoulPipeline({
        raw:
          'ファイルサイズが少し大きすぎるみたい（12MBまで）。別の形で送れるか、分割してみてくれる？',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }

    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) {
      const soul = await runSoulPipeline({
        raw:
          'この形式のファイルにはまだ対応していないみたい（JPEG / PNG / WebP / HEIC / PDF なら大丈夫）。',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }

    const safeName = _sanitizeFilename(file.name);
    const buffer     = Buffer.from(await file.arrayBuffer());

    // クライアントの File.size は改ざんされうる → 実バイト長で再チェック（不正データを Drive へ送らない）
    if (buffer.length > MAX_UPLOAD_BYTES) {
      const soul = await runSoulPipeline({
        raw:
          'ファイルサイズが上限を超えているみたい（12MBまで）。別の形で送れるか、分割してみてくれる？',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }

    const magic = validateDeclaredMimeMagic(mime, buffer);
    if (!magic.ok) {
      const msg = await finalizeDriveUploadMessage({
        userId:   user.id,
        fileName: safeName,
        upload:   { ok: false },
        uploadFailureKind: 'invalid_magic_or_corrupt',
      });
      return {
        ok:    false,
        error: msg.text,
        code:  'INVALID_FILE_CONTENT',
        _debug:
          process.env.NODE_ENV === 'development' ? { soul: msg.debug } : undefined,
      };
    }

    const access = await getValidGoogleDriveAccessForUser(user.id);
    if (!access.ok) {
      const pre = _mapAccessToPrerequisite(access.code);
      const soul = await finalizeDrivePrerequisiteMessage(user.id, pre);
      return {
        ok:    false,
        error: soul.text,
        code:  `DRIVE_${access.code}`,
        _debug:
          process.env.NODE_ENV === 'development' ? { soul: soul.debug } : undefined,
      };
    }

    const upload = await uploadFileToDrive(
      access.accessToken,
      { name: safeName, mimeType: mime, buffer },
      access.folderId,
    );

    if (!upload.ok) {
      const msg = await finalizeDriveUploadMessage({
        userId:   user.id,
        fileName: safeName,
        upload,
        uploadFailureKind: _mapDriveUploadFailureKind(upload),
      });
      return {
        ok:    false,
        error: msg.text,
        code:  'DRIVE_UPLOAD_FAILED',
        _debug:
          process.env.NODE_ENV === 'development' ? { soul: msg.debug } : undefined,
      };
    }

    const supabase = await createServerActionClient();
    const { data: row, error: insErr } = await supabase
      .from('drive_file_pointers')
      .insert({
        user_id:           user.id,
        drive_file_id:     upload.fileId!,
        web_view_link:     upload.webViewLink ?? null,
        original_filename: safeName,
        mime_type:         mime,
        size_bytes:        buffer.length,
        kind,
      })
      .select('id')
      .single();

    if (insErr || !row) {
      console.error('[uploadToDriveAndCreateActivity] pointer insert:', insErr);
      // 孤立ファイル対策: Drive 側をベストエフォート削除
      await deleteDriveFile(access.accessToken, upload.fileId!);
      const soul = await runSoulPipeline({
        raw:
          'Driveへの保存はできたんだけど、Neo側のメモに失敗しちゃった。ちょっと接続が不安定みたい…。少し待ってから、もう一度このチャットからアップロードしてみようか？',
        userId: user.id,
        context: { alertLevel: 'warn' },
      });
      return {
        ok:    false,
        error: soul.text,
        code:  'DB_ERROR',
      };
    }

    const uploadOk: GoogleDriveUploadResult = {
      ok:         true,
      fileId:     upload.fileId,
      webViewLink: upload.webViewLink,
    };

    const msg = await finalizeDriveUploadMessage({
      userId:    user.id,
      fileName:  safeName,
      upload:    uploadOk,
      pointerId: row.id,
    });

    const suggestedDraft = _buildSuggestedDraft(safeName, upload.webViewLink ?? null);

    const pendingDriveConfirmation: PendingDriveConfirmation = {
      pointerId:       row.id,
      driveFileId:     upload.fileId!,
      webViewLink:     upload.webViewLink ?? null,
      fileName:        safeName,
      mimeType:        mime,
      kind,
      suggestedDraft,
    };

    return {
      ok:                      true,
      message:                 msg.text,
      pointerId:               row.id,
      driveFileId:             upload.fileId,
      webViewLink:             upload.webViewLink,
      pendingDriveConfirmation,
      _debug:                  process.env.NODE_ENV === 'development' ? { soul: msg.debug } : undefined,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

function _buildSuggestedDraft(
  fileName: string,
  webViewLink: string | null,
): SuggestedActivityDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    type:           'expense',
    category:       '領収書・未分類',
    title:          fileName.slice(0, 200),
    amount:         1,
    date:           today,
    is_bookkeeping: true,
    receipt_url:    webViewLink,
  };
}

function _sanitizeFilename(name: string): string {
  const trimmed = name.replace(/[/\\]/g, '').trim();
  const base      = trimmed.length > 0 ? trimmed : 'neo-upload';
  return base.slice(0, 200);
}

function _mapDriveUploadFailureKind(
  upload: GoogleDriveUploadResult,
): DriveUploadFailureKind {
  if (upload.errorClass === 'auth_or_permission') {
    return 'permission_or_auth';
  }
  if (upload.errorClass === 'bad_request') {
    return 'bad_request';
  }
  return 'generic';
}

function _mapAccessToPrerequisite(
  code:
    | 'NOT_LINKED'
    | 'REFRESH_FAILED'
    | 'FOLDER_ERROR'
    | 'SESSION_ERROR',
): DrivePrerequisiteKind {
  const m = {
    NOT_LINKED:     'not_linked',
    REFRESH_FAILED: 'refresh_failed',
    FOLDER_ERROR:   'folder_error',
    SESSION_ERROR:  'session_error',
  } as const;
  return m[code];
}
