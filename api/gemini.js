export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Handle both pre-parsed JSON and stringified bodies
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const { prompt, config } = body || {};
  const modelId = req.query.model || 'gemini-flash-latest';
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const rawResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config?.temperature || 0.7,
          maxOutputTokens: config?.max_output_tokens || 400
        }
      })
    });

    if (!rawResponse.ok) {
        throw new Error(`Gemini API Error: ${rawResponse.status}`);
    }

    const data = await rawResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    
    return res.status(200).json({ text, raw: data });
  } catch (error) {
    console.error("API Proxy Error:", error);
    return res.status(500).json({ error: "Failed to connect to Gemini Brain." });
  }
}
