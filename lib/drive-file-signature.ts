/**
 * アップロード直前のサーバー側バイナリ検証（MIME と実体の整合・破損の早期検出）
 *
 * クライアントの File.type / size は改ざんされうるため、Buffer 長とマジックを検証する。
 */

const PDF_MAGIC = Buffer.from('%PDF');

/** 先頭バイトが PDF っぽいか（壊れた PDF の一部は Drive 側で落ちるが、明らかな偽装を弾く） */
export function bufferLooksLikePdf(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  return buf.subarray(0, 4).equals(PDF_MAGIC.subarray(0, 4));
}

function bufferLooksLikeJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function bufferLooksLikePng(buf: Buffer): boolean {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buf.length >= 8 && buf.subarray(0, 8).equals(sig);
}

function bufferLooksLikeWebp(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

/** ISO BMFF: offset 4 に "ftyp"（HEIC/HEIF 等） */
function bufferLooksLikeIsoBmffWithFtyp(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  );
}

export type FileMagicValidationResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'too_small' | 'magic_mismatch' };

/**
 * 宣言 MIME と先頭バイトが一致するか検証する。
 */
export function validateDeclaredMimeMagic(
  declaredMime: string,
  buffer: Buffer,
): FileMagicValidationResult {
  if (buffer.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  switch (declaredMime) {
    case 'application/pdf':
      if (buffer.length < 5) return { ok: false, reason: 'too_small' };
      return bufferLooksLikePdf(buffer)
        ? { ok: true }
        : { ok: false, reason: 'magic_mismatch' };

    case 'image/jpeg':
      if (buffer.length < 3) return { ok: false, reason: 'too_small' };
      return bufferLooksLikeJpeg(buffer)
        ? { ok: true }
        : { ok: false, reason: 'magic_mismatch' };

    case 'image/png':
      if (buffer.length < 8) return { ok: false, reason: 'too_small' };
      return bufferLooksLikePng(buffer)
        ? { ok: true }
        : { ok: false, reason: 'magic_mismatch' };

    case 'image/webp':
      if (buffer.length < 12) return { ok: false, reason: 'too_small' };
      return bufferLooksLikeWebp(buffer)
        ? { ok: true }
        : { ok: false, reason: 'magic_mismatch' };

    case 'image/heic':
    case 'image/heif':
      if (buffer.length < 12) return { ok: false, reason: 'too_small' };
      return bufferLooksLikeIsoBmffWithFtyp(buffer)
        ? { ok: true }
        : { ok: false, reason: 'magic_mismatch' };

    default:
      return { ok: false, reason: 'magic_mismatch' };
  }
}
