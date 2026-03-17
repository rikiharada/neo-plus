// Gemini 3 Flash Upgrade Logic
export const getNeoResponse = async (prompt) => {
  const modelId = "gemini-3-flash-preview"; // 2026 最新世代
  
  // 思考レベルを「解析」と「チャット」で動的に切り替え
  const config = {
    thinking_level: prompt.includes("解析") ? "high" : "balanced",
    temperature: 0.7,
    max_output_tokens: 400 // CEO指定の文字制限に準拠
  };

  try {
    const response = await fetch(`/api/gemini?model=${modelId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, config })
    });
    return await response.json();
  } catch (err) {
    console.error("Neo's Brain Link Error:", err);
  }
};
