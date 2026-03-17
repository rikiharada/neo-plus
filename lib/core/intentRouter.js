// lib/core/intentRouter.js
import { supabase } from '../supabase-client.js';

const CACHE_KEY = 'neo_intent_cache';

export async function routeIntent(input) {
  // 1. Semantic Cacheチェック
  const cached = localStorage.getItem(CACHE_KEY + input);
  if (cached) return JSON.parse(cached);

  // 2. Supabase vector検索（簡易：embeddingは事前計算 or 簡易TF-IDF）
  const { data } = await supabase
    .from('intent_vectors')
    .select('intent, params')
    .textSearch('embedding_text', input, { type: 'websearch' })
    .limit(1);

  const result = {
    intent: data?.[0]?.intent || 'unknown',
    params: data?.[0]?.params || { raw: input },
    cached: false
  };

  localStorage.setItem(CACHE_KEY + input, JSON.stringify(result));
  return result;
}
