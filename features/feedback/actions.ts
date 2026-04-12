/**
 * ベータテスター向けフィードバック — Server Action
 */

'use server';

import { headers } from 'next/headers';
import {
  requireAuth,
  handleServerActionError,
  createServerActionClient,
  isNextRedirectError,
} from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { FeedbackSubmitSchema, formatZodError } from '@/lib/validation';

export interface SubmitFeedbackResult {
  ok:     boolean;
  error?: string;
}

export async function submitFeedback(input: unknown): Promise<SubmitFeedbackResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`feedback:${user.id}`, RATE_LIMIT_PRESETS.feedback);

    const parsed = FeedbackSubmitSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error) };
    }

    const { kind, message, pagePath } = parsed.data;
    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent')?.slice(0, 512) ?? null;

    const supabase = await createServerActionClient();
    const { error } = await supabase.from('user_feedback').insert({
      user_id:    user.id,
      kind,
      message,
      page_path:  pagePath ?? null,
      user_agent: userAgent,
    });

    if (error) {
      console.error('[feedback]', error.code, error.message);
      return {
        ok:    false,
        error: '送信の記録に失敗しました。しばらくしてからもう一度お試しください。',
      };
    }

    return { ok: true };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const out = handleServerActionError(err);
    return { ok: false, error: out.error };
  }
}
