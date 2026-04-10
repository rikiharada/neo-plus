/**
 * app/(app)/accounting-desk/_components/LedgerDeskClient.tsx
 * Ledger Desk — メインオーケストレーター（Client Component）
 *
 * 'use client' 必須（ドラッグ&ドロップ・チャット状態管理）
 *
 * ─── レイアウト ──────────────────────────────────────────────────
 * ┌──────────────────────────────────────────────────────────────┐
 * │  height: 600px  /  border + border-radius: 12px             │
 * ├──────────────┬───────────────────────────────────────────────┤
 * │  左 280px    │  右 flex                                      │
 * │  [CSV][書類] │  ┌─ Header: Neo猫耳 + 損益↗ 請求書↗ 申告↗ ┐ │
 * │  DropZone    │  └──────────────────────────────────────────┘ │
 * │  FileList    │  チャットエリア                               │
 * │  Summary     │  入力エリア                                   │
 * └──────────────┴───────────────────────────────────────────────┘
 *
 * ─── データフロー ────────────────────────────────────────────────
 * 1. FileDropZone でドロップ
 * 2. analyzeFile() — ブラウザ側解析（CSV/Excel/PDF/画像）
 * 3. uploadToDriveAndCreateActivity() — Drive 連携済みの場合のみ
 * 4. generateNeoFirstMessage() — Soul Pipeline を必ず通す
 * 5. DeskMessage として右ペインに表示
 */

'use client';

import {
  useState, useCallback, useEffect, useLayoutEffect, useRef, useTransition,
  type KeyboardEvent as ReactKbEvent,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import type { DeskFileEntry, DeskMessage }    from './types';
import type { DeskTab, ProcessingMode, OcrExtraction } from '@/features/accounting-desk/accounting-types';
import { analyzeFile }                        from '@/features/accounting-desk/file-analyzer';
import { generateNeoFirstMessage }            from '@/features/accounting-desk/neo-trigger';
import { uploadToDriveAndCreateActivity }     from '@/features/drive/actions';

// ─── テーマ定数 ──────────────────────────────────────────────────

const BRAND      = '#534AB7';
const BRAND_LIGHT = '#f0effe';
const BRAND_DARK  = '#3d369a';

// ─── Props ───────────────────────────────────────────────────────

interface LedgerDeskClientProps {
  userId:         string;
  hasDriveLinked: boolean;
}

// ─── コンポーネント ──────────────────────────────────────────────

export function LedgerDeskClient({ userId, hasDriveLinked }: LedgerDeskClientProps) {
  const [activeTab,       setActiveTab]       = useState<DeskTab>('csv');
  const [processingMode,  setProcessingMode]  = useState<ProcessingMode>('auto');
  const [files,           setFiles]           = useState<DeskFileEntry[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [messages,        setMessages]        = useState<DeskMessage[]>([]);
  const [isThinking,      setIsThinking]      = useState(false);
  const [userInput,       setUserInput]       = useState('');
  const [,                startTransition]    = useTransition();
  const processingRef = useRef(false);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  // ─── [Neo] Desk View Initialized（DOM コミット直後） ─────────────
  useLayoutEffect(() => {
    console.info('[Neo] Desk View Initialized', {
      userId,
      hasDriveLinked,
      timestamp: new Date().toISOString(),
    });
  }, [userId, hasDriveLinked]);

  // チャット末尾へオートスクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ─── ファイルドロップ処理 ─────────────────────────────────────

  const handleFileDrop = useCallback(async (file: File) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const id = crypto.randomUUID();
    const entry: DeskFileEntry = {
      id,
      fileName:   file.name,
      fileSizeKb: Math.round(file.size / 1024),
      status:     'uploading',
      addedAt:    Date.now(),
    };

    setFiles((prev) => [entry, ...prev]);
    setSelectedId(id);
    setIsThinking(true);

    try {
      // ① ブラウザ側解析（uploading → analyzing）
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: 'analyzing' } : f));
      const output = await analyzeFile(file);

      setFiles((prev) => prev.map((f) =>
        f.id === id ? { ...f, analysis: output.result, fileSizeKb: output.fileSizeKb } : f,
      ));

      // ② Drive アップロード（連携済みの場合のみ）
      let driveFileId:  string | undefined;
      let driveWebLink: string | undefined;

      if (hasDriveLinked) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind',
          output.result.kind === 'pdf' || output.result.kind === 'image' ? 'receipt' : 'other',
        );
        const uploadResult = await uploadToDriveAndCreateActivity(fd);
        if (uploadResult.ok) {
          driveFileId  = uploadResult.driveFileId  ?? undefined;
          driveWebLink = uploadResult.driveWebLink ?? undefined;
          setFiles((prev) => prev.map((f) =>
            f.id === id ? { ...f, driveFileId, driveWebLink } : f,
          ));
        } else {
          // Drive 失敗でも解析は続行（Neo 第一声は生成する）
          console.warn('[LedgerDesk] Drive upload failed:', uploadResult.error);
        }
      }

      // ③ Neo 第一声生成（Soul Pipeline を必ず通す）
      startTransition(async () => {
        try {
          const neoResult = await generateNeoFirstMessage({
            fileName:    output.fileName,
            analysis:    output.result,
            driveFileId,
            driveWebLink,
          });

          const neoMessage = neoResult.message ?? 'ファイルを受け取ったよ。';

          setFiles((prev) => prev.map((f) =>
            f.id === id ? { ...f, status: 'done', neoMessage } : f,
          ));

          const deskMsg: DeskMessage = {
            id:        crypto.randomUUID(),
            role:      'assistant',
            content:   neoMessage,
            timestamp: new Date().toISOString(),
            fileId:    id,
          };
          setMessages((prev) => [...prev, deskMsg]);
        } catch {
          const fallback = 'ファイルを受け取ったよ。少し待ってから続けて話しかけてね。';
          setFiles((prev) => prev.map((f) =>
            f.id === id ? { ...f, status: 'done', neoMessage: fallback } : f,
          ));
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', content: fallback,
            timestamp: new Date().toISOString(), fileId: id,
          }]);
        } finally {
          setIsThinking(false);
          processingRef.current = false;
        }
      });
    } catch {
      setFiles((prev) => prev.map((f) =>
        f.id === id ? { ...f, status: 'error', errorMessage: 'ファイルの処理に失敗しました' } : f,
      ));
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: 'うまく読み込めなかったみたい😢 もう一度試してみて。',
        timestamp: new Date().toISOString(), fileId: id,
      }]);
      setIsThinking(false);
      processingRef.current = false;
    }
  }, [hasDriveLinked]);

  // ─── ユーザーメッセージ送信 ───────────────────────────────────

  const handleSend = useCallback(() => {
    const text = userInput.trim();
    if (!text || isThinking) return;
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: 'user', content: text,
      timestamp: new Date().toISOString(),
    }]);
    setUserInput('');
    // TODO Step 2: Neo チャット API へ送信
  }, [userInput, isThinking]);

  const handleInputKeyDown = useCallback((e: ReactKbEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // ─── レンダリング ─────────────────────────────────────────────

  const pendingCount = files.filter((f) =>
    f.status === 'uploading' || f.status === 'analyzing',
  ).length;

  return (
    <div style={{
      display:      'flex',
      height:       '600px',
      border:       '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow:     'hidden',
      background:   '#ffffff',
      boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
    }}>

      {/* ─ 左ペイン (280px 固定) ─ */}
      <LeftPane
        activeTab={activeTab}
        onTabChange={setActiveTab}
        processingMode={processingMode}
        onModeChange={setProcessingMode}
        files={files}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onFileDrop={handleFileDrop}
        isDropDisabled={isThinking}
        pendingCount={pendingCount}
        hasDriveLinked={hasDriveLinked}
      />

      {/* ─ 右ペイン (flex) ─ */}
      <RightPane
        messages={messages}
        isThinking={isThinking}
        chatEndRef={chatEndRef}
        userInput={userInput}
        onInputChange={setUserInput}
        onSend={handleSend}
        onInputKeyDown={handleInputKeyDown}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  左ペイン
// ══════════════════════════════════════════════════════════════════

interface LeftPaneProps {
  activeTab:      DeskTab;
  onTabChange:    (t: DeskTab) => void;
  processingMode: ProcessingMode;
  onModeChange:   (m: ProcessingMode) => void;
  files:          DeskFileEntry[];
  selectedId:     string | null;
  onSelect:       (id: string) => void;
  onFileDrop:     (f: File) => void;
  isDropDisabled: boolean;
  pendingCount:   number;
  hasDriveLinked: boolean;
}

function LeftPane({
  activeTab, onTabChange, processingMode, onModeChange,
  files, selectedId, onSelect, onFileDrop, isDropDisabled,
  pendingCount, hasDriveLinked,
}: LeftPaneProps) {
  // 今月の経費（Step 2 で Supabase から取得、現状は done ファイル数で代用）
  const doneCount = files.filter((f) => f.status === 'done').length;

  return (
    <div style={{
      width:          '280px',
      flexShrink:     0,
      borderRight:    '1px solid #e2e8f0',
      display:        'flex',
      flexDirection:  'column',
      background:     '#fafafa',
      overflow:       'hidden',
    }}>

      {/* ── タブ切り替え ── */}
      <div style={{
        display:      'flex',
        borderBottom: '1px solid #e2e8f0',
        padding:      '8px 8px 0',
        gap:          '4px',
        flexShrink:   0,
      }}>
        {([
          { key: 'csv',       label: 'CSV / 明細' },
          { key: 'documents', label: '書類読込' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              flex:        1,
              padding:     '6px 4px',
              fontSize:    '12px',
              fontWeight:  activeTab === key ? 600 : 400,
              color:       activeTab === key ? BRAND : '#64748b',
              background:  activeTab === key ? BRAND_LIGHT : 'transparent',
              border:      'none',
              borderRadius:'6px 6px 0 0',
              cursor:      'pointer',
              whiteSpace:  'nowrap',
              flexShrink:  0,
              transition:  'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── タブコンテンツ（DropZone + モードカード） ── */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        {activeTab === 'documents' && (
          <div style={{ marginBottom: '8px' }}>
            <ProcessingModeCards mode={processingMode} onChange={onModeChange} />
          </div>
        )}

        <CompactDropZone onFileDrop={onFileDrop} disabled={isDropDisabled} />

        {/* Drive 未連携バナー */}
        {!hasDriveLinked && (
          <div style={{
            marginTop:    '6px',
            padding:      '5px 8px',
            background:   '#fff3cd',
            borderRadius: '6px',
            fontSize:     '10px',
            color:        '#854d0e',
            display:      'flex',
            alignItems:   'center',
            gap:          '5px',
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>Drive 未連携 —</span>
            <a href="/settings/integrations" style={{
              color:          BRAND,
              textDecoration: 'underline',
              whiteSpace:     'nowrap',
              flexShrink:     0,
            }}>連携する</a>
          </div>
        )}
      </div>

      {/* ── ファイル一覧 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
        {files.length === 0 ? (
          <p style={{
            fontSize:  '11px',
            color:     '#94a3b8',
            textAlign: 'center',
            padding:   '20px 0',
            lineHeight: 1.6,
          }}>
            ファイルをドロップすると<br />ここに表示されます
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {files.map((f) => (
              <FileListItem
                key={f.id}
                entry={f}
                isSelected={f.id === selectedId}
                onSelect={() => onSelect(f.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── サマリーカード ── */}
      <div style={{
        padding:             '8px 10px',
        borderTop:           '1px solid #e2e8f0',
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '6px',
        flexShrink:          0,
      }}>
        <SummaryCard
          label="今月の経費"
          value={doneCount > 0 ? `${doneCount}件` : '—'}
        />
        <SummaryCard
          label="未処理件数"
          value={`${pendingCount}件`}
          highlight={pendingCount > 0}
        />
      </div>
    </div>
  );
}

// ── ProcessingModeCards ────────────────────────────────────────

function ProcessingModeCards({
  mode, onChange,
}: { mode: ProcessingMode; onChange: (m: ProcessingMode) => void }) {
  const cards: { value: ProcessingMode; icon: string; label: string; desc: string }[] = [
    { value: 'auto',   icon: '⚡', label: 'Neoに全部任せる', desc: '自動仕分けまで一気に（Step2）' },
    { value: 'guided', icon: '🤝', label: '一緒に確認しながら', desc: '1件ずつNeoと確認（Step2）' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {cards.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
            padding:    '7px 10px',
            background: mode === c.value ? BRAND_LIGHT : '#fff',
            border:     `1.5px solid ${mode === c.value ? BRAND : '#e2e8f0'}`,
            borderRadius: '8px',
            cursor:     'pointer',
            textAlign:  'left',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '15px', flexShrink: 0 }}>{c.icon}</span>
          <div>
            <div style={{
              fontSize:   '11px',
              fontWeight: 600,
              color:      mode === c.value ? BRAND : '#1e293b',
            }}>
              {c.label}
            </div>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{c.desc}</div>
          </div>
          {mode === c.value && (
            <span style={{ marginLeft: 'auto', color: BRAND, fontSize: '12px', flexShrink: 0 }}>✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── CompactDropZone ────────────────────────────────────────────

function CompactDropZone({
  onFileDrop, disabled,
}: { onFileDrop: (f: File) => void; disabled?: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      setError('12MB 以下のファイルを選んでね');
      return;
    }
    setError(null);
    onFileDrop(file);
  };

  const onDragEnter = (e: DragEvent) => { e.preventDefault(); if (!disabled) setIsDragging(true); };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="ファイルをドロップまたはクリックして選択"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          border:       `1.5px dashed ${isDragging ? BRAND : '#cbd5e1'}`,
          borderRadius: '8px',
          padding:      '10px',
          textAlign:    'center',
          cursor:       disabled ? 'not-allowed' : 'pointer',
          background:   isDragging ? BRAND_LIGHT : '#fff',
          transition:   'all 0.15s',
          opacity:      disabled ? 0.6 : 1,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,.xlsm,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
          onChange={onChange}
          disabled={disabled}
          style={{ display: 'none' }}
          aria-hidden
          tabIndex={-1}
        />
        <div style={{ fontSize: '18px', marginBottom: '3px' }}>
          {disabled ? '⏳' : isDragging ? '📂' : '⬆️'}
        </div>
        <div style={{ fontSize: '10px', color: '#64748b' }}>
          {disabled ? '処理中…' : isDragging ? 'ここにドロップ' : 'ドロップ or クリック'}
        </div>
        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
          CSV・Excel・PDF・画像 / 最大12MB
        </div>
      </div>
      {error && (
        <p style={{
          margin:     '4px 0 0',
          fontSize:   '10px',
          color:      '#dc2626',
          display:    'flex',
          alignItems: 'center',
          gap:        '4px',
        }}>
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '10px', flexShrink: 0 }}
            aria-label="閉じる"
          >✕</button>
        </p>
      )}
    </div>
  );
}

// ── FileListItem ───────────────────────────────────────────────

function FileListItem({
  entry, isSelected, onSelect,
}: { entry: DeskFileEntry; isSelected: boolean; onSelect: () => void }) {
  const badge = _statusBadge(entry.status);
  const icon  = _kindIcon(entry.analysis?.kind);

  return (
    <li>
      <button
        onClick={onSelect}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
          width:        '100%',
          padding:      '5px 7px',
          background:   isSelected ? BRAND_LIGHT : 'transparent',
          border:       `1px solid ${isSelected ? BRAND : 'transparent'}`,
          borderRadius: '6px',
          cursor:       'pointer',
          textAlign:    'left',
          transition:   'all 0.1s',
        }}
      >
        <span style={{ fontSize: '13px', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize:     '11px',
            fontWeight:   500,
            color:        '#1e293b',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>{entry.fileName}</div>
          <div style={{ fontSize: '9px', color: '#94a3b8' }}>{entry.fileSizeKb} KB</div>
        </div>
        <span style={{
          fontSize:     '9px',
          fontWeight:   600,
          padding:      '1px 6px',
          borderRadius: '9999px',
          background:   badge.bg,
          color:        badge.color,
          whiteSpace:   'nowrap',
          flexShrink:   0,
        }}>
          {badge.label}
        </span>
      </button>
    </li>
  );
}

function _statusBadge(status: DeskFileEntry['status']) {
  switch (status) {
    case 'done':      return { label: '処理済',   bg: '#dcfce7', color: '#16a34a' };
    case 'uploading':
    case 'analyzing': return { label: '確認待ち', bg: '#fef9c3', color: '#854d0e' };
    case 'error':     return { label: 'エラー',   bg: '#fee2e2', color: '#dc2626' };
    default:          return { label: '新規',     bg: '#dbeafe', color: '#1d4ed8' };
  }
}

function _kindIcon(kind?: string): string {
  switch (kind) {
    case 'csv':   return '📊';
    case 'excel': return '📗';
    case 'pdf':   return '📄';
    case 'image': return '🖼️';
    default:      return '📁';
  }
}

// ── SummaryCard ────────────────────────────────────────────────

function SummaryCard({
  label, value, highlight,
}: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background:   highlight ? '#fff7ed' : '#fff',
      border:       `1px solid ${highlight ? '#fed7aa' : '#e2e8f0'}`,
      borderRadius: '8px',
      padding:      '7px 8px',
      textAlign:    'center',
    }}>
      <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>{label}</div>
      <div style={{
        fontSize:   '13px',
        fontWeight: 700,
        color:      highlight ? '#c2410c' : BRAND,
      }}>{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  右ペイン
// ══════════════════════════════════════════════════════════════════

interface RightPaneProps {
  messages:       DeskMessage[];
  isThinking:     boolean;
  chatEndRef:     React.RefObject<HTMLDivElement>;
  userInput:      string;
  onInputChange:  (v: string) => void;
  onSend:         () => void;
  onInputKeyDown: (e: ReactKbEvent<HTMLInputElement>) => void;
}

function RightPane({
  messages, isThinking, chatEndRef,
  userInput, onInputChange, onSend, onInputKeyDown,
}: RightPaneProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

      {/* ─ ヘッダー ─ */}
      <DeskHeader />

      {/* ─ チャットエリア ─ */}
      <div style={{
        flex:          1,
        overflowY:     'auto',
        padding:       '16px 16px 8px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '14px',
      }}>
        {messages.length === 0 && !isThinking && <WelcomeBubble />}

        {messages.map((msg) => (
          <MsgBubble key={msg.id} message={msg} />
        ))}

        {isThinking && <ThinkingBubble />}
        <div ref={chatEndRef} />
      </div>

      {/* ─ 入力エリア ─ */}
      <div style={{
        borderTop:  '1px solid #e2e8f0',
        padding:    '10px 14px',
        display:    'flex',
        gap:        '8px',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Neoに話しかける…"
          disabled={isThinking}
          style={{
            flex:         1,
            padding:      '8px 12px',
            border:       '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize:     '13px',
            outline:      'none',
            background:   isThinking ? '#f8fafc' : '#fff',
            color:        '#1e293b',
            minWidth:     0,
          }}
        />
        <button
          onClick={onSend}
          disabled={!userInput.trim() || isThinking}
          style={{
            padding:      '8px 16px',
            background:   userInput.trim() && !isThinking ? BRAND : '#e2e8f0',
            color:        userInput.trim() && !isThinking ? '#fff' : '#94a3b8',
            border:       'none',
            borderRadius: '8px',
            fontSize:     '13px',
            fontWeight:   600,
            cursor:       userInput.trim() && !isThinking ? 'pointer' : 'not-allowed',
            whiteSpace:   'nowrap',
            flexShrink:   0,
            transition:   'all 0.15s',
          }}
        >
          送信
        </button>
      </div>
    </div>
  );
}

// ── DeskHeader ─────────────────────────────────────────────────

function DeskHeader() {
  const quickActions = [
    { label: '損益',  href: '/cockpit' },
    { label: '請求書', href: '/invoices' },
    { label: '申告',  href: '/tax' },
  ] as const;

  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      padding:      '10px 14px',
      borderBottom: '1px solid #e2e8f0',
      gap:          '10px',
      flexShrink:   0,
    }}>
      {/* Avatar + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <NeoAvatar size={32} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
            Neo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width:        '6px',
              height:       '6px',
              borderRadius: '50%',
              background:   '#22c55e',
              flexShrink:   0,
            }} />
            <span style={{ fontSize: '10px', color: '#64748b' }}>オンライン</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* クイックアクション */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        {quickActions.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '2px',
              padding:        '4px 10px',
              background:     BRAND_LIGHT,
              color:          BRAND,
              border:         `1px solid ${BRAND}`,
              borderRadius:   '6px',
              fontSize:       '11px',
              fontWeight:     600,
              textDecoration: 'none',
              whiteSpace:     'nowrap',
              flexShrink:     0,
              transition:     'all 0.15s',
            }}
          >
            {label} <span style={{ fontSize: '9px' }}>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── NeoAvatar（猫耳付き） ──────────────────────────────────────

function NeoAvatar({ size = 32 }: { size?: number }) {
  const earW = Math.round(size * 0.22);
  const earH = Math.round(size * 0.22);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* 猫耳 (左) */}
      <div style={{
        position:  'absolute',
        top:       `-${Math.round(earH * 0.55)}px`,
        left:      `${Math.round(size * 0.07)}px`,
        width:     `${earW}px`,
        height:    `${earH}px`,
        background: BRAND,
        clipPath:  'polygon(50% 0%, 0% 100%, 100% 100%)',
      }} />
      {/* 猫耳 (右) */}
      <div style={{
        position:  'absolute',
        top:       `-${Math.round(earH * 0.55)}px`,
        right:     `${Math.round(size * 0.07)}px`,
        width:     `${earW}px`,
        height:    `${earH}px`,
        background: BRAND,
        clipPath:  'polygon(50% 0%, 0% 100%, 100% 100%)',
      }} />
      {/* 本体 */}
      <div style={{
        width:          `${size}px`,
        height:         `${size}px`,
        borderRadius:   '50%',
        background:     `linear-gradient(135deg, ${BRAND} 0%, #7c6fd1 100%)`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       `${Math.round(size * 0.45)}px`,
        userSelect:     'none',
      }}>
        🐱
      </div>
    </div>
  );
}

// ── メッセージバブル ────────────────────────────────────────────

function MsgBubble({ message }: { message: DeskMessage }) {
  const isNeo = message.role === 'assistant';
  const time  = new Date(message.timestamp)
    .toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  if (isNeo) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <NeoAvatar size={28} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '80%' }}>
          {/* Neo バブル: border-radius 4px 12px 12px 12px */}
          <div style={{
            padding:      '10px 13px',
            background:   '#f1f0ff',
            borderRadius: '4px 12px 12px 12px',
            fontSize:     '13px',
            color:        '#1e293b',
            lineHeight:   1.65,
            whiteSpace:   'pre-wrap',
            wordBreak:    'break-word',
          }}>
            {message.content}
          </div>
          {/* OCR 読み取り結果カード（Step 2 で実データ） */}
          {message.ocrCard && <DocExtractionCard data={message.ocrCard} />}
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      {/* ユーザーバブル: #534AB7, border-radius 12px 4px 12px 12px */}
      <div style={{
        maxWidth:     '75%',
        padding:      '10px 13px',
        background:   BRAND,
        color:        '#fff',
        borderRadius: '12px 4px 12px 12px',
        fontSize:     '13px',
        lineHeight:   1.65,
        whiteSpace:   'pre-wrap',
        wordBreak:    'break-word',
      }}>
        {message.content}
      </div>
      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{time}</span>
    </div>
  );
}

// ── 書類読み取り結果カード ─────────────────────────────────────

function DocExtractionCard({ data }: { data: OcrExtraction }) {
  const rows: { label: string; value: string | null; highlight?: boolean }[] = [
    { label: '種別',     value: data.documentType },
    { label: '日付',     value: data.date },
    { label: '発行元',   value: data.issuer },
    { label: '勘定科目', value: data.accountTitle, highlight: true },
    { label: '金額',
      value: data.amount !== null
        ? `¥${data.amount.toLocaleString('ja-JP')}`
        : null },
  ];

  return (
    <div style={{
      border:       `1px solid ${BRAND}`,
      borderRadius: '8px',
      overflow:     'hidden',
      background:   '#fff',
      fontSize:     '12px',
      maxWidth:     '300px',
    }}>
      {/* ヘッダー */}
      <div style={{
        background: BRAND,
        color:      '#fff',
        padding:    '6px 10px',
        fontSize:   '11px',
        fontWeight: 600,
      }}>
        書類読み取り結果
      </div>

      {/* 5行（種別/日付/発行元/勘定科目/金額） */}
      <div style={{ padding: '6px 0' }}>
        {rows.map(({ label, value, highlight }) => (
          <div key={label} style={{
            display:    'flex',
            alignItems: 'baseline',
            padding:    '3px 10px',
          }}>
            <span style={{
              width:     '60px',
              flexShrink: 0,
              color:     '#64748b',
              fontSize:  '10px',
            }}>
              {label}
            </span>
            <span style={{
              flex:       1,
              fontWeight: highlight ? 700 : 400,
              color:      highlight ? BRAND : '#1e293b',
            }}>
              {value ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {/* ボタン: grid 1fr 1fr */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '6px',
        padding:             '8px 10px',
        borderTop:           '1px solid #e2e8f0',
      }}>
        {/* 修正: アウトライン */}
        <button
          onClick={() => { /* TODO Step 2 */ }}
          style={{
            padding:      '6px',
            background:   '#fff',
            color:        BRAND,
            border:       `1.5px solid ${BRAND}`,
            borderRadius: '6px',
            fontSize:     '12px',
            fontWeight:   600,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}
        >
          修正
        </button>
        {/* 記帳: 塗り */}
        <button
          onClick={() => { /* TODO Step 2 */ }}
          style={{
            padding:      '6px',
            background:   BRAND,
            color:        '#fff',
            border:       'none',
            borderRadius: '6px',
            fontSize:     '12px',
            fontWeight:   600,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}
        >
          記帳
        </button>
      </div>
    </div>
  );
}

// ── ThinkingBubble（点滅アニメーション） ──────────────────────

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <NeoAvatar size={28} />
      <div style={{
        padding:      '10px 14px',
        background:   '#f1f0ff',
        borderRadius: '4px 12px 12px 12px',
        display:      'flex',
        gap:          '5px',
        alignItems:   'center',
      }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width:            '6px',
              height:           '6px',
              borderRadius:     '50%',
              background:       BRAND,
              animationName:    'thinkDot',
              animationDuration: '1.2s',
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDelay:   `${i * 0.2}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes thinkDot {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
            40%            { transform: scale(1);   opacity: 1;   }
          }
        `}</style>
      </div>
    </div>
  );
}

// ── ウェルカムバブル ────────────────────────────────────────────

function WelcomeBubble() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <NeoAvatar size={28} />
      <div style={{
        padding:      '10px 13px',
        background:   '#f1f0ff',
        borderRadius: '4px 12px 12px 12px',
        fontSize:     '13px',
        color:        '#1e293b',
        lineHeight:   1.65,
      }}>
        ファイルをドロップしてね🎵<br />
        CSV・明細・領収書など、何でも読み取るよ。
      </div>
    </div>
  );
}

// ── ユーティリティ ─────────────────────────────────────────────

/** ファイル種別を Drive アップロードの kind に変換 */
function _guessUploadKind(kind: string): string {
  return kind === 'pdf' || kind === 'image' ? 'receipt' : 'other';
}
// _guessUploadKind は LedgerDeskClient 内のインライン三項演算子に置き換え済みのため
// dead-code 扱いにならないよう export せずに保持（将来の抽出用）
void _guessUploadKind;
