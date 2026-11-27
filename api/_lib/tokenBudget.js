const WINDOW_MS = 60_000;
const DEFAULT_BUDGET = 5_500;
const DEFAULT_OUTPUT_RESERVE = 1_200;
const buckets = new Map();

/** Conservative estimate; provider usage headers remain authoritative when available. */
export function estimateRequestTokens(messages, outputReserve = DEFAULT_OUTPUT_RESERVE) {
  const text = typeof messages === "string" ? messages : JSON.stringify(messages || "");
  return Math.ceil(Math.max(text.length / 3.5, text.trim().split(/\s+/).filter(Boolean).length * 1.25)) + outputReserve;
}

function bucketFor(key, now) {
  const current = buckets.get(key) || [];
  const active = current.filter(entry => now - entry.at < WINDOW_MS);
  buckets.set(key, active);
  return active;
}

/**
 * Per-runtime sliding-window guard. Serverless instances do not share memory;
 * provider rate-limit headers and retry-after handling are still required.
 */
export function reserveTokenBudget({ key = "groq", tokens, limit = DEFAULT_BUDGET, now = Date.now() }) {
  const amount = Math.max(0, Math.ceil(Number(tokens) || 0));
  const active = bucketFor(key, now);
  const used = active.reduce((sum, entry) => sum + entry.tokens, 0);
  if (amount > limit) return { allowed: false, reason: "request_exceeds_budget", used, remaining: Math.max(0, limit - used), retryAfterMs: WINDOW_MS };
  if (used + amount > limit) {
    const oldest = active[0];
    return { allowed: false, reason: "window_budget_exhausted", used, remaining: Math.max(0, limit - used), retryAfterMs: oldest ? Math.max(1, WINDOW_MS - (now - oldest.at)) : WINDOW_MS };
  }
  active.push({ at: now, tokens: amount });
  buckets.set(key, active);
  return { allowed: true, used: used + amount, remaining: Math.max(0, limit - used - amount), retryAfterMs: 0 };
}

export function resetTokenBudgets() { buckets.clear(); }
