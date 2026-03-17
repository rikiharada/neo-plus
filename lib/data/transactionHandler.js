// lib/data/transactionHandler.js
import { supabase } from '../supabase-client.js';

export async function insertTransaction(raw) {
  try {
    const tx = {
      amount: parseFloat(raw.amount.replace(/[^0-9.-]/g, '')),
      date: new Date(raw.date).toISOString().split('T')[0],
      memo: raw.memo.trim(),
      category: raw.category || '未分類',
      user_id: (await supabase.auth.getUser()).data.user.id
    };

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('TX失敗', e);
    return false;
  }
}
