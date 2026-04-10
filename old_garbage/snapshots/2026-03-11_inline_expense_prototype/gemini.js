/**
 * Neo+ Gemini API Integration Prototype
 * Handles dynamic routing based on free-form text input.
 */

const GEMINI_API_KEY_STORAGE = 'neo_plus_gemini_key';
const GEMINI_MODEL = 'gemini-2.5-flash';

// Retrieve or prompt for API key
function getGeminiApiKey() {
    let key = localStorage.getItem(GEMINI_API_KEY_STORAGE);
    if (!key) {
        key = prompt("Neo+ Gemini Prototype\nGoogle Gemini APIキーを入力してください:");
        if (key && key.trim() !== '') {
            localStorage.setItem(GEMINI_API_KEY_STORAGE, key.trim());
        } else {
            console.warn("Gemini API Key was not provided.");
            return null;
        }
    }
    return key;
}

// Clear the stored key (for testing/reset)
function clearGeminiApiKey() {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    console.log("Gemini API Key cleared.");
}

/**
 * Calls the Gemini API to classify the user's intent into a specific view ID.
 * @param {string} userInput - The raw text input from the instruction box.
 * @returns {Promise<string>} - The target view ID (e.g., 'view-dash', 'view-docs').
 */
async function determineRouteFromIntent(userInput) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error("No API Key available.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const promptText = `
[STRICT SYSTEM RULE]
回答は必ず100トークン以内の短いJSONのみにせよ。文章による説明、挨拶、Markdownの装飾（\`\`\`json 等）は一切禁止する。

You are the routing and intelligence engine for a minimalist business accounting app called Neo+.

Determine the user's intent based on their input:
1. If they provide clear expense/income data (like amount AND what it's for, e.g., "タクシー代 2500円 六本木" or "コーナンで資材15000円"), output JSON with "route": "inline-expense", "amount": 2500 (number), "title": "タクシー 〇〇" (string), "force_inline": true (boolean).
2. If they mention an expense but it's unclear or missing amount/details, output {"route": "view-expense", "force_inline": false}.
3. If they want to see overall profit, dashboard, or home, output {"route": "view-dash", "force_inline": false}.
4. If they want to see projects or field sites, output {"route": "view-sites", "force_inline": false}.
5. If they want to change settings, profile, or cloud sync, output {"route": "view-settings", "force_inline": false}.

User Input: "${userInput}"

Output valid JSON ONLY.
Example clear expense: {"route": "inline-expense", "title": "タクシー 六本木", "amount": 2500, "force_inline": true}
Example unclear expense: {"route": "view-expense", "force_inline": false}
Example navigation: {"route": "view-dash", "force_inline": false}
`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: promptText
                    }]
                }],
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_NONE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_NONE"
                    }
                ],
                generationConfig: {
                    temperature: 0.1, // Low temperature for deterministic output
                    maxOutputTokens: 4096,
                    stopSequences: ["}\n", "}`"], // JSONが閉じた時点で強制終了
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
        }

        const data = await response.json();

        // Detailed error logging to see what the API actually returned
        if (!data.candidates || data.candidates.length === 0) {
            console.error("Gemini Response Missing Candidates:", JSON.stringify(data, null, 2));
            throw new Error("Invalid response format from Gemini (No candidates in response payload)");
        }

        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            try {
                const parsed = JSON.parse(generatedText);
                const route = parsed.route;

                // Validate the output is one of our expected views
                const validViews = ['view-dash', 'view-sites', 'view-docs', 'view-settings', 'inline-expense', 'view-expense'];
                if (validViews.includes(route)) {
                    return parsed; // Return the full object for inline-expense
                } else {
                    console.warn(`Gemini returned unrecognized view: ${route}`);
                    return { route: 'view-expense', force_inline: false }; // Default fallback
                }
            } catch (parseError) {
                console.error("Failed to parse Gemini JSON:", generatedText);
                return { route: 'view-expense', force_inline: false };
            }
        } else {
            const finishReason = data.candidates[0]?.finishReason;
            console.error("Gemini Candidate Missing Text. Finish Reason:", finishReason);

            if (finishReason === 'SAFETY') {
                console.warn("Input was blocked by Gemini safety filters.");
                return { route: 'view-expense', force_inline: false }; // Graceful fallback if blocked
            }

            throw new Error(`Invalid response format from Gemini (No text found in candidate). Finish Reason: ${finishReason}`);
        }

    } catch (error) {
        console.error("Gemini Intent Routing failed:", error);
        throw error;
    }
}
