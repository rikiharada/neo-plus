/** Canonical ADD_EXPENSE parser; load from `/js/chat-intent.js` (not pages/chat-intents.js). */
export function parseInputToData(input) {
  try {
    if (!input || typeof input !== "string") {
      console.warn('[Neo Intent] Invalid input type:', typeof input);
      return { error: true, reason: 'Invalid input type' };
    }
    const normalized = input.trim();
    if (!normalized) return { error: true, reason: 'Empty input' };
    const parts = normalized.split(/\s+/);
    const datePart = parts.find((p) => p && (p.includes("月") || p.includes("日")));
    const amountPart = parts.find((p) => p && (p.includes("万") || p.includes("円")));
    let amount = 0;
    if (amountPart) {
      const digits = amountPart.replace(/[^0-9]/g, "");
      if (digits) {
        const n = parseInt(digits, 10);
        if (Number.isFinite(n)) amount = n * (amountPart.includes("万") ? 10000 : 1);
      }
    }
    return {
      date: datePart || new Date().toISOString(),
      amount,
      intent: "ADD_EXPENSE",
      rawInput: normalized
    };
  } catch (e) {
    console.error('[Neo Intent Error] parseInputToData failed:', e.message, e.stack);
    return { error: true, reason: 'Parse exception' };
  }
}
