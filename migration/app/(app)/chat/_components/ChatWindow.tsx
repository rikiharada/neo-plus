/**
 * app/(app)/chat/_components/ChatWindow.tsx
 * チャットウィンドウ — Realtime 対応版
 *
 * 'use client'が必要（useState / useEffect / Realtime）
 *
 * Realtime + Server Components の相性問題と回避策:
 *
 *   問題: Server Component は静的 HTML を返す。Realtime で DB が更新されても
 *         HTML は自動更新されない。
 *
 *   解決策（このファイルでの実装）:
 *     A. チャット履歴は Client 側 useState で管理
 *        → Realtime イベントで直接 setState する（Server re-fetch 不要）
 *     B. 収支データなど Server Component が持つデータが更新された場合は
 *        router.refresh() で Server Component を再レンダリングさせる
 *     C. useEffect cleanup で subscription を必ず解除する
 *        → unmount 後もイベントが飛び続けるメモリリークを防ぐ
 *
 *     D. useRouter を effect の依存配列に入れない（router は ref で参照）
 *        → router 更新のたびに購読が張り直され CHANNEL_ERROR / 多重接続になりやすい
 *
 *     E. router.refresh() はデバウンス + 全経路共通スロットル（Realtime・チャット送信・記帳で共有）
 *
 *     F. `isChatRealtimeDisabledFromEnv()`（= NEXT_PUBLIC_CHAT_REALTIME=0|false）で **購読ゼロ** — フォールバック・比較用
 *
 *     G. NEXT_PUBLIC_CHAT_REALTIME_RSC=0 で Realtime イベントからの RSC 更新のみオフ
 *        （チャット本文は Client のため、ナビ等のサーバーデータは手動ナビで追従）
 *
 *     H. CHANNEL_ERROR / TIMED_OUT は指数バックオフ **2s → 4s → 8s** で最大 3 回まで再購読 → RECONNECT_EXHAUSTED
 *     H-2. 購読前に `ensureSessionForRealtimeSubscribe`（getSession → 無効なら refreshSession → setAuth）
 *     H-3. `removeNeoChatActivitiesChannel` を **await** してから `channel()`（WebSocket 競合の抑止）
 *     H-4. チャンネル参照は **useRef + モジュール singleton**（`lib/supabase/chat-realtime.ts`）で二重購読を抑止
 *     H-5. Realtime ソケット timeout 20s（`lib/supabase/realtime-config.ts`）
 *
 *     I. NEXT_PUBLIC_CHAT_REALTIME_REFRESH_MIN_MS で RSC 更新の最短間隔（**下限 2500ms**）
 *
 *     J. Page Visibility: タブ非表示中は Realtime 由来のデバウンスタイマーをキャンセルし、
 *        再表示時に 1 回だけ requestRscRefresh（長時間バックグラウンド後のサーバー表示ズレを補正）
 *
 *     K. NEXT_PUBLIC_CHAT_REALTIME_RSC=0 と通常時の違い:
 *        - 通常: activities の DB 変更が Realtime で届くと（デバウンス後）RSC 更新 → ナビ等が追従
 *        - RSC=0: その自動追従だけオフ。チャット送信・Agentic 承認・Drive 記帳後の refresh はそのまま
 *
 * ⚠️ 残りうる論点と対策:
 *   - 多重接続の残骸 → `removeNeoChatActivitiesChannel` await のあと `removeOrphanNeoChatActivityChannels`
 *   - セッション切れ → 再接続のたび `ensureSessionForRealtimeSubscribe` + `onAuthStateChange` で setAuth
 *   - router.refresh と Realtime → **同一 requestRscRefresh** で最短 2500ms + postgres_changes は 450ms デバウンス
 *
 * ⚠️ Realtime のよくある罠:
 *   - channel.subscribe() を cleanup しないと unmount 後もイベントが飛ぶ
 *   - supabase.removeChannel() と channel.unsubscribe() は異なる（前者を使う）
 *   - Realtime はブラウザ接続を維持するため、バックグラウンドタブで電力消費増
 *   - RLS でフィルタしても Realtime はデフォルトで全行を受信する → filter を設定する
 */

'use client';

import {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
  type CSSProperties,
}                              from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import Link                    from 'next/link';
import { useRouter }           from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ensureSessionForRealtimeSubscribe,
  isChatRealtimeDisabledFromEnv,
  removeNeoChatActivitiesChannel,
  removeOrphanNeoChatActivityChannels,
  setNeoChatActivitiesChannel,
  REALTIME_RECONNECT_BACKOFF_MS,
} from '@/lib/supabase/chat-realtime';
import { MessageBubble }       from './MessageBubble';
import { ChatInput }           from './ChatInput';
import { handleInstruction }   from '@/features/chat/actions';
import type { ChatMessage, ParsedAction } from '@/features/chat/actions';
import { insertActivity } from '@/features/activities/actions';
import {
  dismissDrivePendingMessage,
  type PendingDriveConfirmation,
  type UploadToDriveResult,
} from '@/features/drive/actions';
import { DriveUploadForm } from '@/features/drive/DriveUploadForm';
import { isConfirmExecutionMessage } from '@/lib/agent-chat-confirm';
import { AgenticPendingPanel } from './AgenticPendingPanel';

/** postgres_changes 後にまとめるまでの待ち（ms） */
const REALTIME_DEBOUNCE_MS = 450;

/** RSC refresh の最短間隔（Realtime・送信・Drive 記帳で共有）— 下限 2500ms */
function getRscRefreshMinMs(): number {
  const raw = process.env.NEXT_PUBLIC_CHAT_REALTIME_REFRESH_MIN_MS;
  const n   = raw ? parseInt(raw, 10) : 2500;
  if (Number.isNaN(n)) return 2500;
  return Math.min(120_000, Math.max(2500, n));
}

/** 開発時のみ Realtime の詳細ログ（静かな本番向け） */
const CHAT_RT_DEBUG =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_CHAT_REALTIME_DEBUG === '1';

const REALTIME_RSC_FROM_EVENTS_DISABLED =
  process.env.NEXT_PUBLIC_CHAT_REALTIME_RSC === '0' ||
  process.env.NEXT_PUBLIC_CHAT_REALTIME_RSC === 'false';

const REALTIME_MAX_RECONNECT = 3;

/** 他タブで Agentic 承認が完了したときに localStorage で通知（storage イベントは別タブのみ） */
const NEO_AGENTIC_TAB_STORAGE_KEY = 'neo-agentic-cleared-v1';

// ─── 型定義 ─────────────────────────────────────────────────────

interface ChatWindowProps {
  /** サーバー側で取得した初期メッセージ（オプション） */
  initialMessages?: ChatMessage[];
  /** 認証ユーザー ID（Realtime フィルタリングに使用） */
  userId:           string;
  className?:       string;
}

// ─── コンポーネント ──────────────────────────────────────────────

export function ChatWindow({
  initialMessages = [],
  userId,
  className,
}: ChatWindowProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const supabase = getSupabaseBrowserClient();

  const [messages,     setMessages]     = useState<ChatMessage[]>(initialMessages);
  const [isThinking,   setIsThinking]   = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** マルチタブ: 別タブで承認が済んだときの一行ヒント（エラーではない） */
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isPending,    startTransition] = useTransition();
  /** Supabase Realtime 購読状態（接続中バッジは SUBSCRIBING のみ） */
  const [rtStatus, setRtStatus] = useState<string>(() =>
    isChatRealtimeDisabledFromEnv() ? 'DISABLED' : 'SUBSCRIBING',
  );
  const bottomRef  = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  /** Realtime: postgres_changes のデバウンスタイマー */
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** RSC refresh のスロットル（最終実行時刻） */
  const lastRscRefreshAtRef = useRef(0);
  /** スロットルで遅延した refresh のタイマー */
  const rscRefreshTrailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 励まし最終表示時刻（Soul パイプラインのインターバル制御に使用）
  const lastEncouragementRef = useRef<number>(0);
  /** Agentic: サーバーが承認待ちにしたアクション（「実行して」送信用） */
  const [pendingActions, setPendingActions] = useState<ParsedAction[] | null>(null);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [goalSummary, setGoalSummary] = useState<string | null>(null);
  /** サーバー発行の承認トークン（HMAC）— pendingActions と同時に handleInstruction へ */
  const [pendingApprovalToken, setPendingApprovalToken] = useState<string | null>(
    null,
  );
  const [pendingApprovalNonce, setPendingApprovalNonce] = useState<string | null>(
    null,
  );
  const [pendingApprovalIssuedAt, setPendingApprovalIssuedAt] = useState<
    number | null
  >(null);
  /** Drive アップロード後の記帳保留（Zero-Server） */
  const [pendingDrive, setPendingDrive] = useState<PendingDriveConfirmation | null>(null);
  const [driveBookAmount, setDriveBookAmount] = useState<number>(1);
  const [driveBookLoading, setDriveBookLoading] = useState(false);
  const [driveDismissLoading, setDriveDismissLoading] = useState(false);

  // ─ スクロール ──────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  /**
   * レイアウト内の Server Components（ナビ・サマリー等）を更新する RSC 再フェッチ。
   * Realtime の連発・チャット送信・記帳で **同一スロットル** — Realtime イベントは 450ms デバウンス後にここへ来るため、
   * `router.refresh()` と WebSocket 受信の競合は「最短 2500ms 間隔」で緩和される。
   */
  const requestRscRefresh = useCallback(() => {
    const minMs = getRscRefreshMinMs();
    const now   = Date.now();
    const elapsed = now - lastRscRefreshAtRef.current;
    if (elapsed >= minMs) {
      lastRscRefreshAtRef.current = now;
      startTransition(() => {
        routerRef.current.refresh();
      });
      return;
    }
    const wait = minMs - elapsed;
    if (rscRefreshTrailingRef.current) {
      clearTimeout(rscRefreshTrailingRef.current);
    }
    rscRefreshTrailingRef.current = setTimeout(() => {
      rscRefreshTrailingRef.current = null;
      lastRscRefreshAtRef.current = Date.now();
      startTransition(() => {
        routerRef.current.refresh();
      });
    }, wait);
  }, [startTransition]);

  useEffect(() => {
    return () => {
      if (rscRefreshTrailingRef.current) {
        clearTimeout(rscRefreshTrailingRef.current);
        rscRefreshTrailingRef.current = null;
      }
    };
  }, []);

  // ─ タブの表示 / 非表示（長時間利用時の無駄な RSC と、再表示時の同期） ─
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (realtimeDebounceRef.current) {
          clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = null;
        }
        return;
      }
      // visible: バックグラウンド中に溜まった差分をサーバー表示に反映
      requestRscRefresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [requestRscRefresh]);

  // ─ マルチタブ: 同じ nonce の承認が別タブで完了したら、このタブの保留を手元で解除 ─
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== NEO_AGENTIC_TAB_STORAGE_KEY || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue) as { n?: string };
        if (data.n && pendingApprovalNonce === data.n) {
          setPendingActions(null);
          setPlanSummary(null);
          setGoalSummary(null);
          setPendingApprovalToken(null);
          setPendingApprovalNonce(null);
          setPendingApprovalIssuedAt(null);
          setInfoMessage(
            'ほかのタブですでに進めたみたい。このタブの保留は手元で閉じたよ。',
          );
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pendingApprovalNonce]);

  // ─ Realtime: 収支テーブルの変更を監視（シングルトン・await remove・セッション確認・2/4/8s バックオフ） ─
  useEffect(() => {
    if (isChatRealtimeDisabledFromEnv()) {
      setRtStatus('DISABLED');
      return;
    }

    const channelName = `neo-chat-activities:${userId}`;
    if (CHAT_RT_DEBUG) {
      console.info(
        '[Neo+ Chat Realtime] DEBUG=1 — verbose logs. Set NEXT_PUBLIC_CHAT_REALTIME=0 to disable postgres_changes.',
      );
    }
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    /** 連続失敗回数（成功時 0 にリセット）。3 回目のバックオフ後にまだ失敗なら EXHAUSTED */
    let reconnectFailureIndex = 0;

    const scheduleReconnect = (reason: 'CHANNEL_ERROR' | 'TIMED_OUT') => {
      if (cancelled || reconnectFailureIndex >= REALTIME_MAX_RECONNECT) {
        setRtStatus('RECONNECT_EXHAUSTED');
        if (CHAT_RT_DEBUG) {
          console.warn('[ChatWindow] Realtime: reconnect exhausted', channelName);
        }
        return;
      }
      const delayMs = REALTIME_RECONNECT_BACKOFF_MS[reconnectFailureIndex];
      reconnectFailureIndex += 1;
      setRtStatus('SUBSCRIBING');
      if (CHAT_RT_DEBUG) {
        console.warn(
          `[ChatWindow] Realtime ${reason} → retry in ${delayMs}ms (${reconnectFailureIndex}/${REALTIME_MAX_RECONNECT})`,
        );
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) void subscribe();
      }, delayMs);
    };

    const subscribe = async () => {
      if (cancelled) return;

      await removeNeoChatActivitiesChannel(supabase, channelRef);
      await removeOrphanNeoChatActivityChannels(supabase, userId);
      setRtStatus('SUBSCRIBING');

      const sessionOk = await ensureSessionForRealtimeSubscribe(supabase);
      if (cancelled) return;
      if (!sessionOk) {
        if (CHAT_RT_DEBUG) {
          console.warn('[ChatWindow] Realtime: no valid session, skip subscribe');
        }
        scheduleReconnect('CHANNEL_ERROR');
        return;
      }

      const channel = supabase.channel(channelName);
      channelRef.current = channel;
      setNeoChatActivitiesChannel(channel);

      channel
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'activities',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (CHAT_RT_DEBUG) {
              console.debug('[ChatWindow] Realtime activity change');
            }
            if (REALTIME_RSC_FROM_EVENTS_DISABLED) return;
            if (realtimeDebounceRef.current) {
              clearTimeout(realtimeDebounceRef.current);
            }
            realtimeDebounceRef.current = setTimeout(() => {
              realtimeDebounceRef.current = null;
              requestRscRefresh();
            }, REALTIME_DEBOUNCE_MS);
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            reconnectFailureIndex = 0;
            setRtStatus('SUBSCRIBED');
            if (CHAT_RT_DEBUG) {
              console.debug('[ChatWindow] Realtime subscribed:', channelName);
            }
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRtStatus(status);
            void (async () => {
              await removeNeoChatActivitiesChannel(supabase, channelRef);
              if (cancelled) return;
              scheduleReconnect(
                status === 'TIMED_OUT' ? 'TIMED_OUT' : 'CHANNEL_ERROR',
              );
            })();
            return;
          }
          setRtStatus(status);
        });
    };

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      try {
        await supabase.realtime.setAuth(session?.access_token ?? null);
        if (
          CHAT_RT_DEBUG &&
          (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')
        ) {
          console.debug('[ChatWindow] realtime.setAuth after', event);
        }
      } catch {
        /* 静かに失敗 */
      }
    });

    void subscribe();

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      void removeNeoChatActivitiesChannel(supabase, channelRef).finally(() => {
        setRtStatus('CLOSED');
        if (CHAT_RT_DEBUG) {
          console.debug('[ChatWindow] Realtime cleanup:', channelName);
        }
      });
    };
  }, [userId, supabase, requestRscRefresh]);

  // ─ 送信ハンドラー ─────────────────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    setErrorMessage(null);
    setInfoMessage(null);

    // ① 楽観的更新: ユーザーメッセージを即座に表示
    const userMsg: ChatMessage = {
      role:      'user',
      content:   text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    try {
      // ② Server Action 呼び出し
      //    ⚠️ 直近 10 件のみ渡す（プロンプトサイズ制限 + レイテンシ削減）
      const sendConfirm =
        Boolean(pendingActions?.length) && isConfirmExecutionMessage(text);

      if (
        sendConfirm &&
        (!pendingApprovalToken ||
          !pendingApprovalNonce ||
          pendingApprovalIssuedAt == null)
      ) {
        setErrorMessage(
          '承認のセッションが切れているみたい。もう一度、登録案を出してから試してみて。',
        );
        setMessages((prev) => prev.filter((m) => m !== userMsg));
        setIsThinking(false);
        return;
      }

      const result = await handleInstruction({
        message: text,
        history: messages.slice(-10),
        ...(sendConfirm &&
        pendingActions?.length &&
        pendingApprovalToken &&
        pendingApprovalNonce != null &&
        pendingApprovalIssuedAt != null
          ? {
              pendingActionsToConfirm: pendingActions,
              pendingApprovalToken,
              pendingApprovalNonce,
              pendingApprovalIssuedAt,
            }
          : {}),
      });

      if (!result.ok) {
        setErrorMessage(
          result.error ??
            'ちょっと接続が不安定みたい…。一息ついて、もう一度だけ試してみようか？',
        );
        setMessages((prev) => prev.filter((m) => m !== userMsg));
        return;
      }

      if (process.env.NODE_ENV === 'development' && result._debug) {
        console.debug('[ChatWindow] handleInstruction _debug', result._debug);
      }

      // ③ AI 返答をメッセージリストに追加（Soul 適用済みテキスト）
      //    goal/plan は同じターンのメッセージに埋め込み、提案のみでも履歴に残す（AgenticPendingPanel 外でも可視）
      if (result.reply) {
        const g = result.agent?.goalSummary?.trim();
        const p = result.agent?.planSummary?.trim();
        const assistantMsg: ChatMessage = {
          role:      'assistant',
          content:   result.reply,
          timestamp: new Date().toISOString(),
          ...(g ? { goalSummary: g } : {}),
          ...(p ? { planSummary: p } : {}),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        const dbg = result._debug as { encouragementInjected?: boolean } | undefined;
        if (dbg?.encouragementInjected) {
          lastEncouragementRef.current = Date.now();
        }
      }

      // ④ 保留アクション: サーバーが承認待ちのときだけクライアントが保持（Agentic: goal / plan / tools）
      const broadcastNonce =
        sendConfirm &&
        result.agent?.loopPhase === 'executed' &&
        pendingApprovalNonce
          ? pendingApprovalNonce
          : null;

      setPendingActions(null);
      setPlanSummary(null);
      setGoalSummary(null);
      setPendingApprovalToken(null);
      setPendingApprovalNonce(null);
      setPendingApprovalIssuedAt(null);
      if (result.ok && result.agent?.awaitingConfirmation && result.actions?.length) {
        setPendingActions(result.actions);
        setPlanSummary(result.agent.planSummary ?? null);
        setGoalSummary(result.agent.goalSummary ?? null);
        setPendingApprovalToken(result.agent.pendingApprovalToken ?? null);
        setPendingApprovalNonce(result.agent.pendingApprovalNonce ?? null);
        setPendingApprovalIssuedAt(result.agent.pendingApprovalIssuedAt ?? null);
      }

      if (broadcastNonce) {
        try {
          localStorage.setItem(
            NEO_AGENTIC_TAB_STORAGE_KEY,
            JSON.stringify({ n: broadcastNonce, at: Date.now() }),
          );
        } catch {
          /* プライベートモード等 */
        }
      }
    } catch (err) {
      console.error('[ChatWindow] handleInstruction error:', err);
      setErrorMessage(
        '一瞬の揺らぎみたい。Neoはここにいるよ。もう一度だけ試してみようか？',
      );
      setMessages((prev) => prev.filter((m) => m !== userMsg));
    } finally {
      setIsThinking(false);

      // ⑤ サーバー側の要約・ナビ等を更新（Agentic 承認後の DB 反映もここで追従。RSC はスロットル）
      requestRscRefresh();
    }
  }, [
    messages,
    pendingActions,
    pendingApprovalToken,
    pendingApprovalNonce,
    pendingApprovalIssuedAt,
    requestRscRefresh,
  ]);

  const onDriveUploadComplete = useCallback((r: UploadToDriveResult) => {
    if (r.ok && r.pendingDriveConfirmation) {
      setPendingDrive(r.pendingDriveConfirmation);
      setDriveBookAmount(r.pendingDriveConfirmation.suggestedDraft.amount);
      if (r.message) {
        setMessages((prev) => [
          ...prev,
          {
            role:      'assistant',
            content:   r.message!,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } else if (!r.ok && r.error) {
      setErrorMessage(r.error);
    }
  }, []);

  const handleBookFromDrive = useCallback(async () => {
    if (!pendingDrive) return;
    setDriveBookLoading(true);
    setErrorMessage(null);
    try {
      const d = pendingDrive.suggestedDraft;
      const result = await insertActivity({
        type:           d.type,
        category:       d.category,
        title:          d.title,
        amount:         driveBookAmount,
        date:           d.date,
        is_bookkeeping: d.is_bookkeeping,
        receipt_url:    d.receipt_url,
      });
      if (!result.ok) {
        setErrorMessage(
          result.error ??
            'ちょっと接続が不安定みたい…。一息ついて、もう一度だけ試してみようか？',
        );
        return;
      }
      if (result.message) {
        const text = result.message;
        setMessages((prev) => [
          ...prev,
          {
            role:      'assistant',
            content:   text,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
      setPendingDrive(null);
      requestRscRefresh();
    } finally {
      setDriveBookLoading(false);
    }
  }, [pendingDrive, driveBookAmount, requestRscRefresh]);

  const handleDismissDrivePending = useCallback(async () => {
    if (!pendingDrive) return;
    const name = pendingDrive.fileName;
    setErrorMessage(null);
    setDriveDismissLoading(true);
    try {
      const r = await dismissDrivePendingMessage(name);
      if (r.ok) {
        setPendingDrive(null);
        if (r.message) {
          const dismissText = r.message;
          setMessages((prev) => [
            ...prev,
            {
              role:      'assistant',
              content:   dismissText,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } else if (!r.ok && r.error) {
        setErrorMessage(r.error);
      }
    } catch (e) {
      console.error('[ChatWindow] dismissDrivePendingMessage:', e);
      setErrorMessage(
        '一瞬の揺らぎみたい。Neoはここにいるよ。もう一度だけ試してみようか？',
      );
    } finally {
      setDriveDismissLoading(false);
    }
  }, [pendingDrive]);

  // ─ レンダリング ────────────────────────────────────────────────

  /** 接続ハンドシェイク中のみ（CHANNEL_ERROR では「接続中…」を出し続けない） */
  const showRtPending = rtStatus === 'SUBSCRIBING';
  /** 再購読リトライ尽き: 操作は可能。Neo 調の一行のみ（技術用語は出さない） */
  const showRtReconnectHint = rtStatus === 'RECONNECT_EXHAUSTED';

  const rtChipStyle: CSSProperties = {
    position:      'fixed',
    zIndex:        9997,
    right:         'max(12px, env(safe-area-inset-right))',
    fontSize:      12,
    lineHeight:    1.25,
    padding:       '6px 10px',
    borderRadius:  12,
    color:         'var(--text-muted, #536471)',
    background:    'var(--header-bg, rgba(255,255,255,0.95))',
    border:        '1px solid rgba(0,0,0,0.06)',
    boxShadow:
      '0 12px 28px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.08)',
    pointerEvents: 'none',
    maxWidth:      'min(92vw, 20rem)',
  };

  return (
    <div className={['chat-window', className].filter(Boolean).join(' ')}>

      <div style={{ margin: '8px 12px' }}>
        <DriveUploadForm onComplete={onDriveUploadComplete} />
      </div>

      {pendingDrive && (
        <PendingDriveUploadBanner
          pending={pendingDrive}
          amount={driveBookAmount}
          onAmountChange={setDriveBookAmount}
          onBook={handleBookFromDrive}
          onDismiss={handleDismissDrivePending}
          bookLoading={driveBookLoading}
          dismissLoading={driveDismissLoading}
        />
      )}

      {pendingActions && pendingActions.length > 0 && (
        <AgenticPendingPanel
          goalSummary={goalSummary}
          planSummary={planSummary}
          /** チャットバブルに既に目標・計画を表示しているのでパネルでは省略（重複防止） */
          omitGoalPlan={Boolean(goalSummary?.trim() || planSummary?.trim())}
          pendingActions={pendingActions}
          hasDrivePending={Boolean(pendingDrive)}
          onConfirm={() => handleSend('実行して')}
        />
      )}

      {showRtPending && (
        <div
          className="chat-realtime-pending"
          role="status"
          aria-live="polite"
          style={{
            ...rtChipStyle,
            bottom: 'max(72px, env(safe-area-inset-bottom))',
          }}
        >
          接続中…
        </div>
      )}

      {showRtReconnectHint && (
        <div
          className="chat-realtime-reconnect-hint"
          role="status"
          aria-live="polite"
          style={{
            ...rtChipStyle,
            bottom: 'max(72px, env(safe-area-inset-bottom))',
          }}
        >
          接続が何度か途切れたみたい。数字の表示は、少し動いたら更新されるよ。気になるときは、他のページへ一度移動して戻ってね。
        </div>
      )}

      {/* ─ メッセージリスト ─ */}
      <div
        className="chat-messages"
        role="log"
        aria-label="チャット履歴"
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* 空状態のウェルカム表示 */}
        {messages.length === 0 && !isThinking && (
          <EmptyState onSuggestion={handleSend} />
        )}

        {/* メッセージバブル */}
        {messages.map((msg, i) => (
          <MessageBubble
            key={`${msg.timestamp}-${i}`}
            message={msg}
            isLatest={i === messages.length - 1 && !isThinking}
          />
        ))}

        {/* Thinking インジケーター */}
        {isThinking && <ThinkingIndicator />}

        {/* エラー表示 */}
        {errorMessage && (
          <ErrorBanner
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        {infoMessage && (
          <div
            className="chat-info-banner"
            role="status"
            aria-live="polite"
            style={{
              margin:       '8px 12px',
              padding:      '10px 12px',
              fontSize:     13,
              lineHeight:   1.45,
              borderRadius: 12,
              background:   'rgba(59, 130, 246, 0.08)',
              border:       '1px solid rgba(59, 130, 246, 0.22)',
              color:        'var(--text-main, #0F1419)',
            }}
          >
            <span>{infoMessage}</span>
            <button
              type="button"
              onClick={() => setInfoMessage(null)}
              style={{
                marginLeft:   8,
                border:       'none',
                background:   'transparent',
                cursor:       'pointer',
                color:        'var(--text-muted, #536471)',
              }}
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        )}

        {/* スクロール基準点 */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* ─ 入力欄 ─ */}
      <div className="chat-input-area">
        <ChatInput
          onSend={handleSend}
          disabled={isThinking || isPending}
        />
      </div>
    </div>
  );
}

// ─── サブコンポーネント ──────────────────────────────────────────

function PendingDriveUploadBanner({
  pending,
  amount,
  onAmountChange,
  onBook,
  onDismiss,
  bookLoading,
  dismissLoading,
}: {
  pending:        PendingDriveConfirmation;
  amount:           number;
  onAmountChange:   (n: number) => void;
  onBook:           () => void;
  onDismiss:        () => void | Promise<void>;
  bookLoading:      boolean;
  dismissLoading:   boolean;
}) {
  const busy = bookLoading || dismissLoading;
  return (
    <div
      role="region"
      aria-label="Driveに保存したファイルの記帳"
      className="drive-pending-banner-anim"
      style={{
        margin:       '8px 12px',
        padding:      '12px 14px',
        fontSize:     13,
        lineHeight:   1.45,
        borderRadius: 12,
        background:   'rgba(16, 185, 129, 0.08)',
        border:       '1px solid rgba(16, 185, 129, 0.25)',
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-main, #0F1419)' }}>
        Driveに保存済み（{pending.fileName}）
      </p>
      {pending.webViewLink && (
        <p style={{ margin: '0 0 8px' }}>
          <a
            href={pending.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Driveで開く
          </a>
        </p>
      )}
      <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted, #536471)' }}>
        金額（円）
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) =>
            onAmountChange(Math.max(1, parseInt(e.target.value, 10) || 1))
          }
          disabled={busy}
          style={{ marginLeft: 8, width: 120 }}
        />
      </label>
      <p style={{ margin: '0 0 8px', color: 'var(--text-muted, #536471)' }}>
        この内容で記帳してよければ「記帳する」を押してください。あとからチャットで直しても大丈夫。
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted, #536471)' }}>
        「あとで」は<strong>記帳だけ保留</strong>。ファイルは Google Drive に残るよ。あとからもう一度記帳するときは、
        <Link href="#neo-drive-upload" style={{ color: 'var(--color-neo-primary, #4F46E5)' }}>
          上のフォーム
        </Link>
        から同じファイルを選び直すと、この確認をまた出せる。
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onBook}
          disabled={busy}
          style={{
            padding:      '8px 14px',
            fontSize:     13,
            borderRadius: 999,
            border:       'none',
            cursor:       busy ? 'wait' : 'pointer',
            background:   'var(--color-neo-primary, #059669)',
            color:        '#fff',
          }}
        >
          {bookLoading ? '記帳中…' : '記帳する'}
        </button>
        <button
          type="button"
          onClick={() => void onDismiss()}
          disabled={busy}
          aria-label="記帳を保留にしてバナーを閉じる（Drive上のファイルは残ります）"
          style={{
            padding:      '8px 14px',
            fontSize:     13,
            borderRadius: 999,
            border:       '1px solid rgba(0,0,0,0.12)',
            background:   'transparent',
            cursor:       busy ? 'wait' : 'pointer',
          }}
        >
          {dismissLoading ? '保留にする…' : 'あとで'}
        </button>
      </div>
    </div>
  );
}

const SUGGESTION_MESSAGES = [
  '電車代 500円を記録して',
  '今月の収支を教えて',
  'コーヒー代 600円、接待交際費で登録',
  '先週の経費を確認したい',
] as const;

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="chat-empty-state">
      <p className="chat-empty-title">こんにちは！ Neoです。</p>
      <p className="chat-empty-subtitle">
        収支を記録したいとき、質問があるとき、<br />
        お気軽に話しかけてください。
      </p>
      <div className="chat-suggestions" role="list">
        {SUGGESTION_MESSAGES.map((s) => (
          <button
            key={s}
            role="listitem"
            className="chat-suggestion-chip"
            onClick={() => onSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div
      className="flex gap-2 items-end"
      role="status"
      aria-label="Neoが考えています"
    >
      <div className="neo-avatar" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--color-neo-primary, #4F46E5)" />
          <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fontFamily="system-ui">N</text>
        </svg>
      </div>
      <div className="message-bubble message-bubble--neo message-bubble--thinking">
        <span className="thinking-dot" style={{ animationDelay: '0ms' }} />
        <span className="thinking-dot" style={{ animationDelay: '160ms' }} />
        <span className="thinking-dot" style={{ animationDelay: '320ms' }} />
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message:   string;
  onDismiss: () => void;
}) {
  return (
    <div className="chat-error" role="alert" aria-live="assertive">
      <span className="chat-error-icon" aria-hidden="true">⚠</span>
      <span className="chat-error-text">{message}</span>
      <button
        className="chat-error-dismiss"
        onClick={onDismiss}
        aria-label="エラーを閉じる"
      >
        ✕
      </button>
    </div>
  );
}
