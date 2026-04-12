/**
 * app/(app)/chat/page.tsx
 * チャットページ — Server Component が初期状態を渡し、ChatWindow が送受信・Realtime を担当
 */

import type { Metadata } from 'next';
import { requireAuth, createServerComponentClient } from '@/lib/supabase/server';
import { getGoogleDriveLinkedForUser } from '@/lib/drive-integration-status';
import { ChatWindow } from './_components/ChatWindow';
import type { ChatMessage } from '@/features/chat/chat-types';

export const metadata: Metadata = {
  title: 'チャット | Neo+',
};

export default async function ChatPage() {
  const [user, supabase] = await Promise.all([
    requireAuth(),
    createServerComponentClient(),
  ]);

  const [hasDrive, activitiesResult] = await Promise.all([
    getGoogleDriveLinkedForUser(user.id, supabase),
    supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);
  const hasActivities = (activitiesResult.count ?? 0) > 0;

  let initialMessages: ChatMessage[] = [];

  if (!hasDrive) {
    initialMessages = [
      {
        role: 'assistant',
        content:
          'はじめまして。今日からあなたのビジネスを支える Neo です。まずは、領収書や請求書を安全にしまうための「Neo専用フォルダ」をあなたのGoogle Driveに作らせてくれないかな？ もちろん、中身を勝手に見たりはしないよ。上のフォームから連携を進めてね。',
        timestamp: new Date().toISOString(),
      },
    ];
  } else if (!hasActivities) {
    initialMessages = [
      {
        role: 'assistant',
        content:
          '連携ありがとう！「Neo_Documents」というフォルダを作っておいたよ。さっそく試してみよう。手元にある最近の領収書、あるいは交通費のスクショでもいいから、下のクリップボタンか上のフォームから1枚アップロードしてみて。',
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
