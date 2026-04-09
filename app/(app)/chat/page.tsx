/**
 * app/(app)/chat/page.tsx
 * チャットページ — Server Component + Client チャットウィンドウ
 *
 * ⚠️ 落とし穴:
 *   1. ChatWindow は 'use client' なので、Server から初期メッセージを渡す場合は
 *      JSON シリアライズ可能なデータのみ props に含める
 *   2. チャット履歴を DB に保存する場合は sessions テーブルを別途用意する
 *      （今回は Client の useState で保持: ページリロードでリセット）
 *   3. Streaming が必要なら Route Handler (app/api/chat/route.ts) + useChat (Vercel AI SDK) を検討
 */

import type { Metadata }  from 'next';
import { requireAuth, createServerComponentClient } from '@/lib/supabase/server';
import { ChatWindow }     from './_components/ChatWindow';
import type { ChatMessage } from '@/features/chat/actions';

// ─── メタデータ ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'チャット | Neo+',
};

// ─── ページコンポーネント ────────────────────────────────────────

export default async function ChatPage() {
  const user = await requireAuth();
  const supabase = await createServerComponentClient();

  // Onboarding flow: Magic Moment checkpoints
  const [integrationsResult, activitiesResult] = await Promise.all([
    supabase
      .from('user_integrations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('provider', 'google_drive'),
    supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const hasDrive = (integrationsResult.count ?? 0) > 0;
  const hasActivities = (activitiesResult.count ?? 0) > 0;

  let initialMessages: ChatMessage[] = [];

  if (!hasDrive) {
    initialMessages = [
      {
        role: 'assistant',
        content: 'はじめまして。今日からあなたのビジネスを支える Neo です。まずは、領収書や請求書を安全にしまうための『専用フォルダ』をあなたのGoogle Driveに作らせてくれないかな？ もちろん、中身を勝手に見たりはしないよ。上のフォームから連携を進めてね。',
        timestamp: new Date().toISOString(),
      },
    ];
  } else if (!hasActivities) {
    initialMessages = [
      {
        role: 'assistant',
        content: '連携ありがとう！『Neo_Documents』っていうフォルダを作っておいたよ。さっそく試してみよう。手元にある最近の領収書、あるいは交通費のスクショでもいいから、下のクリップ📎ボタンか上のフォームから1枚アップロードしてみて。',
        timestamp: new Date().toISOString(),
      },
    ];
  }

  return (
    <div className="chat-page">
      <div className="chat-page-header">
        <h1 className="chat-page-title">Neo とチャット</h1>
        <p className="chat-page-subtitle">
          収支の記録や確認を、会話で行えます。
        </p>
      </div>

      <ChatWindow
        userId={user.id}
        initialMessages={initialMessages}
        className="chat-page-window"
      />
    </div>
  );
}
