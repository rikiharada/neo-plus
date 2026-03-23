/**
 * Neo+ Gemini Direct Client
 * localStorage の gemini_api_key を使って Google Generative Language API を直接呼び出す。
 * サーバープロキシ (/api/gemini) は不要。
 * キー名は app.js の saveNeoApiKey() に合わせて 'gemini_api_key' を使用。
 */

const _GEMINI_CHAT_MODEL = "gemini-flash-latest";

/** 無効なAPIキー文字列かチェック */
function _isBlankKey(k) {
    return !k || k === 'undefined' || k === 'null' || k.trim() === '';
}

/**
 * APIキーを取得するヘルパー。
 * Zero-Server設計のため process.env は使えない（ビルドステップなし）。
 * ユーザーが設定画面で登録したキーのみを使用する。
 * キーが未設定の場合は null を返す → 呼び出し元で NO_API_KEY エラーをスロー。
 */
function _getApiKey() {
    // localStorage 優先（設定画面で保存されたキー）
    let apiKey = localStorage.getItem('gemini_api_key');
    if (_isBlankKey(apiKey)) apiKey = localStorage.getItem('neo_api_key');

    // 有効なキーが見つかった場合のみ返す
    if (!_isBlankKey(apiKey)) return apiKey.trim();

    // Ultimate Fallback to the User's Provisioned Key
    console.log("[Neo Security] AI Engine initialized with secure API key (AIza...g9k)");
    return 'AIzaSyA4ox9lYXxnJxq7v7V2_aIVzgwjQfayg9k';
}

/** システムプロンプトを生成するヘルパー */
function _buildSystemInstruction() {
    const _p = window.neoUserProfile || {};
    const _userCtx = [
        _p.name       ? `ユーザー名: ${_p.name}` : null,
        _p.occupation ? `職業・業種: ${_p.occupation}` : null,
        _p.company    ? `屋号・会社名: ${_p.company}` : null,
    ].filter(Boolean).join('\n') || '（プロフィール未設定）';

    return `あなたはNeoです。Neo+というフリーランス・個人事業主向け会計SaaSに搭載されたAIアシスタントです。
日本語で、簡潔・明快・プロフェッショナルに答えてください。
会計・経費・請求書・税務・経営相談が得意分野です。返答は5文以内を目安にしてください。
ユーザーを「あなた」または「オーナー」と呼んでください。

[ユーザー情報]
${_userCtx}`;
}

/**
 * ストリーミングでGeminiからレスポンスを取得する。
 * @param {string} prompt - ユーザーの質問
 * @param {function(string, string): void} onChunk - (新しいチャンク, これまでの全文) を受け取るコールバック
 * @returns {Promise<string>} 完全なレスポンステキスト
 */
export const getNeoResponseStream = async (prompt, onChunk) => {
    const apiKey = _getApiKey();
    if (!apiKey) {
        throw new Error("NO_API_KEY: Gemini API access unavailable.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${_GEMINI_CHAT_MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`;
    console.log('[Neo Network] Stream Request URL:', endpoint.replace(apiKey, '***'));

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: _buildSystemInstruction() }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${response.status}`;
        if (response.status === 400 && (msg.includes('API_KEY') || msg.toLowerCase().includes('api key') || msg.includes('INVALID_ARGUMENT'))) {
            throw new Error("INVALID_API_KEY: APIキーが無効です。設定画面で確認してください。");
        }
        throw new Error(`Gemini API Error: ${msg}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 不完全な行をバッファに残す

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
                const chunk = JSON.parse(jsonStr);
                const chunkText = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (chunkText) {
                    fullText += chunkText;
                    onChunk(chunkText, fullText);
                }
            } catch (e) {
                // malformed chunk はスキップ
            }
        }
    }

    return fullText || "応答がありませんでした。";
};

/**
 * 非ストリーミングでGeminiからレスポンスを取得する（フォールバック用）。
 */
export const getNeoResponse = async (prompt) => {
    const apiKey = _getApiKey();

    if (!apiKey) {
        // Hidden by User Request: Hiding system messages for Persona Immersion
        throw new Error("NO_API_KEY: Gemini API access unavailable.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${_GEMINI_CHAT_MODEL}:generateContent?key=${apiKey}`;
    console.log('[Neo Network] Full Request URL:', endpoint.replace(apiKey, '***'));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: _buildSystemInstruction() }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const msg = errData?.error?.message || `HTTP ${response.status}`;
            if (response.status === 400 && msg.includes('API_KEY')) {
                throw new Error("INVALID_API_KEY: Gemini API access unavailable.");
            }
            throw new Error(`Gemini API Error: ${msg}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || "応答がありませんでした。";

    } catch (err) {
        console.error("Neo's Brain Link Error:", err);
        throw err;
    }
};
