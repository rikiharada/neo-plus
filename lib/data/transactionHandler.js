// lib/data/transactionHandler.js
import { supabase } from '../supabase-client.js';

export async function insertTransaction(raw) {
  try {
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data?.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const amt = raw.amount;
    const amount = typeof amt === 'number' && !Number.isNaN(amt)
      ? amt
      : parseFloat(String(amt ?? '').replace(/[^0-9.-]/g, '')) || 0;

    const dateStr = raw.date
      ? new Date(String(raw.date).replace(/\//g, '-')).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let projectId = raw.projectId ?? raw.project_id ?? null;
    if (projectId == null || projectId === '') {
      const n = raw.projectName || raw.project_name;
      if (typeof window !== 'undefined' && window.findProjectIdByName && n) {
        projectId = window.findProjectIdByName(n);
      }
    }
    if ((projectId == null || projectId === '') && typeof window !== 'undefined' && window.resolveExpenseProjectId) {
      projectId = window.resolveExpenseProjectId(raw, raw.originalInput || '');
    }

    const plist = typeof window !== 'undefined' ? window.mockDB?.projects : [];
    const hit = plist?.find((p) => String(p.id) === String(projectId));
    if (hit) projectId = hit.id;

    const tx = {
      amount,
      date: dateStr,
      memo: String(raw.memo ?? raw.title ?? '').trim(),
      category: raw.category || '未分類',
      user_id: userId
    };

    if (projectId != null && projectId !== '') {
      tx.project_id = projectId;
    }

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('TX失敗', e);
    return false;
  }
}
