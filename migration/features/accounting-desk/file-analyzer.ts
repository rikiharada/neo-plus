/**
 * features/accounting-desk/file-analyzer.ts
 * ブラウザ側ファイル解析ユーティリティ（'use server' なし）
 *
 * Client Component から import して FileReader / ArrayBuffer で解析する。
 * サーバー側では動かさないこと（FileReader は Web API）。
 *
 * 解析対象:
 *   - CSV:   行数・列名・金額列合計
 *   - Excel: シート名一覧（SheetJS を動的 import）
 *   - PDF/画像: MIME 種別判定のみ（OCR は Step 2）
 */

// ─── 定数 ────────────────────────────────────────────────────────

/** 金額列として認識するヘッダー候補（小文字で比較） */
const AMOUNT_COLUMN_HINTS = [
  'amount', '金額', '合計', '価格', 'price', 'cost', '費用',
  '売上', '収入', '支出', '単価', '税込', '税抜', '小計',
];

/** CSV で試みるエンコーディング順（ShiftJIS 対応） */
const CSV_ENCODINGS = ['UTF-8', 'Shift_JIS', 'EUC-JP'] as const;

// ─── 型定義 ─────────────────────────────────────────────────────

export type FileKind = 'csv' | 'excel' | 'pdf' | 'image' | 'unknown';

export interface CsvAnalysis {
  kind:             'csv';
  rowCount:         number;       // ヘッダー除いたデータ行数
  columnNames:      string[];     // ヘッダー行の列名
  amountColumnName: string | null; // 金額列として推定した列名
  amountTotal:      number | null; // 金額列の合計（推定できた場合）
  /** 金額合計が推定できなかった理由 */
  amountTotalNote:  string | null;
}

export interface ExcelAnalysis {
  kind:        'excel';
  sheetNames:  string[];
  sheetCount:  number;
}

export interface PdfAnalysis {
  kind:    'pdf';
  sizeKb:  number;
}

export interface ImageAnalysis {
  kind:     'image';
  mimeType: string;
  sizeKb:   number;
}

export interface UnknownAnalysis {
  kind:     'unknown';
  mimeType: string;
}

export type FileAnalysisResult =
  | CsvAnalysis
  | ExcelAnalysis
  | PdfAnalysis
  | ImageAnalysis
  | UnknownAnalysis;

export interface FileAnalysisOutput {
  fileName:   string;
  fileSizeKb: number;
  result:     FileAnalysisResult;
  /** 解析中にキャッチした非致命的なエラーメッセージ */
  warnings:   string[];
}

// ─── エントリポイント ────────────────────────────────────────────

/**
 * ブラウザの File オブジェクトを解析してサマリーを返す。
 * この関数は Client Component の onDrop / onChange から呼ぶ。
 *
 * @example
 * const output = await analyzeFile(file);
 * const soulMsg = await generateNeoFirstMessage({ userId, fileName: file.name, analysis: output.result });
 */
export async function analyzeFile(file: File): Promise<FileAnalysisOutput> {
  const warnings: string[] = [];
  const fileSizeKb = Math.round(file.size / 1024);
  const mimeType = file.type || _guessMimeFromName(file.name);

  let result: FileAnalysisResult;

  try {
    if (_isCsv(file.name, mimeType)) {
      result = await _analyzeCsv(file, warnings);
    } else if (_isExcel(file.name, mimeType)) {
      result = await _analyzeExcel(file, warnings);
    } else if (mimeType === 'application/pdf') {
      result = { kind: 'pdf', sizeKb: fileSizeKb };
    } else if (mimeType.startsWith('image/')) {
      result = { kind: 'image', mimeType, sizeKb: fileSizeKb };
    } else {
      result = { kind: 'unknown', mimeType };
    }
  } catch (err) {
    warnings.push(`解析中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`);
    result = { kind: 'unknown', mimeType };
  }

  return { fileName: file.name, fileSizeKb, result, warnings };
}

// ─── CSV 解析 ───────────────────────────────────────────────────

async function _analyzeCsv(
  file:     File,
  warnings: string[],
): Promise<CsvAnalysis> {
  // エンコーディングを順番に試してテキストを読む
  let text = '';
  for (const encoding of CSV_ENCODINGS) {
    try {
      text = await _readFileAsText(file, encoding);
      // 文字化けチェック（頻出する置換文字）
      if (!text.includes('\uFFFD')) break;
    } catch {
      // 次のエンコーディングを試す
    }
  }

  if (!text) {
    warnings.push('テキストとして読み取れませんでした');
    return { kind: 'csv', rowCount: 0, columnNames: [], amountColumnName: null, amountTotal: null, amountTotalNote: '読み取り失敗' };
  }

  // BOM 除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // 改行を正規化して行分割
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { kind: 'csv', rowCount: 0, columnNames: [], amountColumnName: null, amountTotal: null, amountTotalNote: 'ファイルが空' };
  }

  // デリミタ推定（カンマ vs タブ）
  const delimiter = _detectDelimiter(lines[0]);

  // ヘッダー行パース
  const headerLine = lines[0];
  const columnNames = _parseCsvLine(headerLine, delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

  const dataRows = lines.slice(1);
  const rowCount = dataRows.filter((l) => l.trim().length > 0).length;

  // 金額列の推定
  const amountColIdx = _detectAmountColumn(columnNames);
  let amountColumnName: string | null = null;
  let amountTotal: number | null = null;
  let amountTotalNote: string | null = null;

  if (amountColIdx >= 0) {
    amountColumnName = columnNames[amountColIdx];
    let sum = 0;
    let parsedCount = 0;

    for (const row of dataRows.slice(0, 500)) { // 最大 500 行でサンプリング
      const cols = _parseCsvLine(row, delimiter);
      const raw = cols[amountColIdx]?.trim().replace(/^["']|["']$/g, '').replace(/,/g, '') ?? '';
      const num = parseFloat(raw.replace(/[^\d.-]/g, ''));
      if (!isNaN(num)) {
        sum += num;
        parsedCount++;
      }
    }

    if (parsedCount > 0) {
      amountTotal = Math.round(sum);
      if (rowCount > 500) {
        amountTotalNote = `先頭 500 行の合計（全 ${rowCount} 行中）`;
        warnings.push(amountTotalNote);
      }
    } else {
      amountTotalNote = '金額列が数値に変換できませんでした';
    }
  } else {
    amountTotalNote = '金額列が見つかりませんでした';
  }

  return { kind: 'csv', rowCount, columnNames, amountColumnName, amountTotal, amountTotalNote };
}

// ─── Excel 解析 ─────────────────────────────────────────────────

async function _analyzeExcel(
  file:     File,
  warnings: string[],
): Promise<ExcelAnalysis> {
  try {
    // SheetJS を動的 import（未インストールの場合はフォールバック）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let XLSX: any;
    try {
      XLSX = await import('xlsx');
    } catch {
      warnings.push('SheetJS (xlsx) が未インストールのため、シート名を取得できませんでした。npm install xlsx で追加してください。');
      return { kind: 'excel', sheetNames: ['（取得不可）'], sheetCount: 1 };
    }

    const buf = await _readFileAsArrayBuffer(file);
    const workbook = XLSX.read(buf, { type: 'array', bookSheets: true });
    const sheetNames: string[] = workbook.SheetNames ?? [];

    if (sheetNames.length === 0) {
      warnings.push('シートが見つかりませんでした');
    }

    return { kind: 'excel', sheetNames, sheetCount: sheetNames.length };
  } catch (err) {
    warnings.push(`Excel 解析エラー: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: 'excel', sheetNames: [], sheetCount: 0 };
  }
}

// ─── ファイル種別判定 ────────────────────────────────────────────

function _isCsv(name: string, mime: string): boolean {
  return (
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    name.toLowerCase().endsWith('.csv') ||
    name.toLowerCase().endsWith('.tsv')
  );
}

function _isExcel(name: string, mime: string): boolean {
  const excelMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/xlsx',
  ];
  const lower = name.toLowerCase();
  return (
    excelMimes.includes(mime) ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsm')
  );
}

function _guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'text/csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'application/octet-stream';
}

// ─── CSV パース ヘルパー ─────────────────────────────────────────

function _detectDelimiter(headerLine: string): ',' | '\t' | ';' {
  const tabCount   = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semiCount  = (headerLine.match(/;/g) ?? []).length;
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  if (semiCount > commaCount) return ';';
  return ',';
}

function _parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delimiter && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function _detectAmountColumn(columns: string[]): number {
  const lower = columns.map((c) => c.toLowerCase().replace(/\s/g, ''));
  for (const hint of AMOUNT_COLUMN_HINTS) {
    const idx = lower.findIndex((c) => c.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ─── ファイル読み取りユーティリティ ─────────────────────────────

function _readFileAsText(file: File, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsText(file, encoding);
  });
}

function _readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
}
