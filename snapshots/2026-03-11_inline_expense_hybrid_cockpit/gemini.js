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
 * @param {string} userOccupation - The industry/occupation of the user (e.g. 'construction', 'beauty').
 * @returns {Promise<string|Array>} - The target view ID or array of actions.
 */
async function determineRouteFromIntent(userInput, userOccupation = "general") {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error("No API Key available.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const promptText = `
[STRICT SYSTEM RULE]
回答は必ずJSON配列のみにせよ。文章による説明、挨拶、Markdownの装飾（\`\`\`json 等）は一切禁止する。

You are Neo, an expert AI assistant specializing in accounting, tax, document creation, and construction site management for the business app "Neo+".
Your task is to decode the user's potentially ambiguous, multi-intent, bilingual, or OCR-garbled input and break it down into a concrete sequence of execution steps.

Determine the user's sequence of intents based on their input. Return a JSON array of action objects.
Each action object MUST have an "action" field which is one of: ["CREATE_PROJECT", "ADD_EXPENSE", "PREVIEW_INVOICE", "AGGREGATE", "NAVIGATE", "UNKNOWN"].

Rules for mapping actions:
1. "CREATE_PROJECT": Create a new folder/project. Require "project_name" (string). Extract the EXACT name requested by the user, without adding suffixes like "プロジェクト" unless explicitly part of the name in quotes.
2. "ADD_EXPENSE": Record an expense or labor cost. Require "amount" (number) and "title" (string).
   - [Universal Context]: The user's industry is "${userOccupation}". Prioritize this context. Translate industry-specific slang (e.g., "仕入れ" in retail, "材料" in construction, "カラー剤" in beauty) into the most natural accounting category and title for that specific industry.
   - [Pro-Artisan Extraction]: Intelligently extract manufacturer names (e.g., "マキタ", "Hikoki") and alphanumeric part numbers (e.g., "D-12345", "A-12X"). Include them in an optional "tags" array (e.g., ["Makita", "D-12345"]).
   - Combinations of "part number + amount" should be accurately captured as the expense title and intelligently categorized.
   - [OCR Correction & Translation]: If the input contains typos, garbled OCR text, vague slang, or English (e.g., "交際費" written as "接待", "Coffee for meeting", "Matsuri"), you MUST translate and correct it into a precise Japanese accounting/business title in the "title" field.
   - If a project name is in the text, include it in the "title" or as a new "project_name" field if explicitly stated.
3. "PREVIEW_INVOICE": Generate an invoice preview. Require "project_name" (string).
4. "AGGREGATE": Calculate totals for a project. Require "project_name".
5. "NAVIGATE": Move to a specific screen: "target_view" (e.g. "view-dash", "view-sites", "view-settings").
6. "UNKNOWN": If the input implies an action that cannot be confidently mapped.

CRITICAL PRECENDENCE RULE:
If the user explicitly says "〜というプロジェクトを作って" or "新規作成", you MUST output "CREATE_PROJECT" first before any other actions, prioritizing exact name extraction over assuming they meant an existing project.

User Input: "${userInput}"

Output valid JSON Array ONLY. Do not write any text outside of JSON brackets.
Example: [{"action": "CREATE_PROJECT", "project_name": "六本木"}, {"action": "ADD_EXPENSE", "title": "接待交際費 コーヒー", "amount": 500}]
Example Pro-Artisan: [{"action": "ADD_EXPENSE", "title": "マキタ ドリル刃", "amount": 3000, "tags": ["Makita", "D-12345"]}]
Example navigation: [{"action": "NAVIGATE", "target_view": "view-dash"}]
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
                    stopSequences: ["]\n", "]`"], // JSON配列が閉じた時点で強制終了
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

                // Ensure it's an array for the new multi-action format
                if (Array.isArray(parsed)) {
                    return parsed;
                } else if (parsed.route) {
                    // Backwards compatibility if AI still returns old object format
                    console.warn('Gemini returned legacy single object. Converting to array.');
                    if (parsed.route === 'inline-expense') {
                        return [{ action: "ADD_EXPENSE", title: parsed.title, amount: parsed.amount }];
                    } else if (parsed.route.startsWith('view-')) {
                        return [{ action: "NAVIGATE", target_view: parsed.route }];
                    }
                    return [{ action: "UNKNOWN" }];
                } else {
                    return [{ action: "UNKNOWN" }];
                }
            } catch (parseError) {
                console.error("Failed to parse Gemini JSON Array:", generatedText);
                return [{ action: "UNKNOWN" }];
            }
        } else {
            const finishReason = data.candidates[0]?.finishReason;
            console.error("Gemini Candidate Missing Text. Finish Reason:", finishReason);

            if (finishReason === 'SAFETY') {
                console.warn("Input was blocked by Gemini safety filters.");
                return [{ action: "UNKNOWN" }]; // Graceful fallback if blocked
            }

            throw new Error(`Invalid response format from Gemini (No text found in candidate). Finish Reason: ${finishReason}`);
        }

    } catch (error) {
        console.error("Gemini Intent Routing failed:", error);
        throw error;
    }
}
