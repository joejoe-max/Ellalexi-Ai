import { estimateRequestTokens, inspectTokenBudget, reserveTokenBudget, releaseTokenBudget, settleTokenBudget } from "./tokenBudget.js";

const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const DEFAULT_OPENROUTER_MODELS = ["openrouter/free"];
const DEFAULT_OUTPUT_TOKENS = 1000;
const MIN_GROQ_OUTPUT_TOKENS = 256;

const unique = items => [...new Set(items.filter(Boolean))];
const configured = (value, fallback = []) => {
  const list = unique(String(value || "").split(",").map(item => item.trim()));
  const defaults = Array.isArray(fallback) ? fallback : [fallback];
  return list.length ? list : unique(defaults.map(item => String(item || "").trim()));
};

export function getGroqReasoningModels() {
  return configured(process.env.GROQ_REASONING_MODELS, DEFAULT_GROQ_MODELS).slice(0, 4);
}

export function getOpenRouterModels() {
  return [...DEFAULT_OPENROUTER_MODELS];
}

export function getOpenRouterModel() {
  return getOpenRouterModels()[0];
}

export function classifyReasoningError(status, payload = {}, cause) {
  const code = String(payload?.error?.code || payload?.error?.type || "").toLowerCase();
  const message = String(payload?.error?.message || "").toLowerCase();
  const blob = `${code} ${message}`;
  if (cause?.name === "TimeoutError" || cause?.name === "AbortError") return { kind: "timeout", retry: true, message: "The AI service took too long to respond." };
  if (cause instanceof TypeError) return { kind: "network_error", retry: true, message: "The AI service could not be reached." };
  if (cause?.name === "EmptyResponseError") return { kind: "empty_response", retry: true, message: "The AI service returned an empty response." };
  if (status === 429 || /rate_limit|quota|too_many_requests/.test(code)) return { kind: "rate_limit", retry: true, message: "The AI service is temporarily busy." };
  if (/json_validate_failed|failed to validate json|failed_generation/.test(blob)) return { kind: "json_validation", retry: true, message: "The AI service could not produce valid structured output." };
  if ((status === 400 || status === 422) && /response_format|json_schema|json schema|structured output/.test(blob)) return { kind: "unsupported_format", retry: true, message: "The AI model does not support the requested response format." };
  if (status === 413) return { kind: "request_too_large", retry: false, message: "The document context is too large for the AI provider request." };
  if (status === 404 || /model_not_found|model_unavailable/.test(code)) return { kind: "model_unavailable", retry: true, message: "The selected AI model is unavailable." };
  if ([500, 502, 503, 504].includes(status)) return { kind: "provider_unavailable", retry: true, message: "The AI service is temporarily unavailable." };
  if (status === 401 || status === 403) return { kind: "configuration", retry: false, message: "The AI provider could not authenticate the request." };
  if (status === 400 || status === 422) return { kind: "invalid_request", retry: false, message: "The AI request could not be processed." };
  return { kind: "provider_error", retry: false, message: "The AI request failed." };
}

// TEMPORARY STUB - full module being restored. Do not deploy.
export function classifyProviderPayload(payload) {
  if (!payload || typeof payload !== "object") return { kind: "empty_response", detail: "missing_payload" };
  return { kind: "ok" };
}

export function generateWithFallback() {
  return Promise.reject(Object.assign(new Error("reasoning.js is being restored"), { kind: "configuration", httpStatus: 503 }));
}

export function streamWithFallback() {
  return Promise.reject(Object.assign(new Error("reasoning.js is being restored"), { kind: "configuration", httpStatus: 503 }));
}
