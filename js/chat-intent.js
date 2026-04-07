/** Canonical ADD_EXPENSE parser; load from `/js/chat-intent.js` (not pages/chat-intents.js). */
export function parseInputToData(input) {
  try {
    if (typeof input !== "string") return { error: true };
    const normalized = input.trim();
    if (!normalized) return { error: true };
    const parts = normalized.split(/\s+/);
    const datePart = parts.find((p) => p && (p.includes("月") || p.includes("日")));
    const amountPart = parts.find((p) => p && (p.includes("万") || p.includes("円")));
    let amount = 0;
    if (amountPart) {
      const digits = amountPart.replace(/[^0-9]/g, "");
      if (digits) {
        const n = parseInt(digits, 10);
        if (Number.isFinite(n)) amount = n * 10000;
      }
    }
    return {
      date: datePart || new Date().toISOString(),
      amount,
      intent: "ADD_EXPENSE",
    };
  } catch (_e) {
    console.error('[Neo Intent Error]', _e);
    return { error: true };
  }
}
