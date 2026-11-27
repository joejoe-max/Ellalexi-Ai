import { estimateRequestTokens, inspectTokenBudget, reserveTokenBudget } from "./tokenBudget.js";

const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const DEFAULT_OUTPUT_TOKENS = 1000;
const MIN_GROQ_OUTPUT_TOKENS = 256;

const unique = items => [...new Set(items.filter(Boolean))];
const configured = (value, fallback) => {
  const list = unique(String(value || "").split(",").map(item => item.trim()));
  return list.length ? list : fallback;
};

export function getGroqReasoningModels() {
  return configured(process.env.GROQ_REASONING_MODELS, DEFAULT_GROQ_MODELS).slice(0, 4);
}

export function getOpenRouterModels() {
  return configured(process.env.OPENROUTER_MODELS || process.env.OPENROUTER_MODEL, "openrouter/free").slice(0, 4);
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

function normalizeSchema(schema) {
  if (Array.isArray(schema)) return schema.map(normalizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") out.type = ({ OBJECT: "object", ARRAY: "array", STRING: "string", INTEGER: "integer", NUMBER: "number", BOOLEAN: "boolean" })[value] || value.toLowerCase();
    else if (key === "properties" && value) out.properties = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, normalizeSchema(child)]));
    else if (key === "items") out.items = normalizeSchema(value);
    else if (["required", "enum", "description", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern"].includes(key)) out[key] = value;
    else if (key === "additionalProperties") out.additionalProperties = value;
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

function schemaHint(schema) {
  const normalized = normalizeSchema(schema);
  const keys = Array.isArray(normalized?.required) && normalized.required.length ? normalized.required : Object.keys(normalized?.properties || {});
  if (!keys.length) return "";
  return "Return one JSON object and no markdown. Include these keys, using empty arrays or short strings when a category is unsupported: " + keys.join(", ") + ".";
}

function formatModes(config = {}, provider) {
  const wantsJson = Boolean(config.responseSchema || config.responseMimeType === "application/json");
  if (!wantsJson) return ["none"];
  if (provider === "groq" && config.responseSchema) return ["strict", "json"];
  return ["json", "none"];
}

function responseFormat(config = {}, provider, mode) {
  if (mode === "strict" && config.responseSchema && provider === "groq") {
    return { type: "json_schema", json_schema: { name: "ellabrief_response", strict: true, schema: normalizeSchema(config.responseSchema) } };
  }
  if (mode === "json") return { type: "json_object" };
  return undefined;
}

function systemFor(system, config = {}, mode) {
  if (mode === "strict" || !config.responseSchema) return system;
  const hint = schemaHint(config.responseSchema);
  return hint ? [system, hint].filter(Boolean).join("\n\n") : system;
}

function groqControls(model) {
  const raw = process.env.GROQ_REASONING_EFFORT;
  const effort = String(raw ?? "low").trim().toLowerCase();
  if (!effort || effort === "off" || effort === "none" || !/^(low|medium|high)$/.test(effort)) return {};
  if ((raw == null || raw === "") && !/gpt-oss/i.test(String(model))) return {};
  return { reasoning_effort: effort };
}

function toContent(parts = []) {
  const content = [];
  for (const part of parts) {
    if (typeof part?.text === "string") content.push({ type: "text", text: part.text });
    else if (part?.inlineData?.data && part.inlineData.mimeType) content.push({ type: "image_url", image_url: { url: "data:" + part.inlineData.mimeType + ";base64," + part.inlineData.data } });
  }
  return content.length === 1 && content[0].type === "text" ? content[0].text : content;
}

function messages(parts, system) {
  return [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: toContent(parts) }];
}

function providerError(status, payload, cause, provider, model) {
  return Object.assign(new Error("Provider request failed."), {
    ...classifyReasoningError(status, payload, cause),
    provider,
    model,
    providerStatus: status || null,
    providerCode: String(payload?.error?.code || payload?.error?.type || "").slice(0, 80),
    providerMessage: String(payload?.error?.message || payload?.message || cause?.message || "").replace(/[\r\n]+/g, " ").slice(0, 180)
  });
}

function budgetError(model, plan) {
  return Object.assign(new Error("Local Groq token budget is temporarily exhausted."), {
    kind: "rate_limit",
    retry: true,
    provider: "groq",
    model,
    retryAfterMs: plan.retryAfterMs || 60_000,
    providerStatus: 429,
    providerCode: "local_token_budget",
    promptTokenEstimate: plan.inputTokens ?? null
  });
}

function planGroqBudget({ requestMessages, format, requestedOutput }) {
  const formatTokens = format ? Math.ceil(JSON.stringify(format).length / 3.5) : 0;
  const inputTokens = estimateRequestTokens(requestMessages, 0) + formatTokens;
  const limit = Number(process.env.GROQ_LOCAL_TPM_BUDGET) || 5500;
  const { remaining } = inspectTokenBudget({ key: "groq", limit });
  const requested = Math.max(1, Number(requestedOutput) || DEFAULT_OUTPUT_TOKENS);
  if (inputTokens + MIN_GROQ_OUTPUT_TOKENS > limit) return { allowed: false, reason: "request_exceeds_budget", inputTokens, requested };
  let completionCap = requested;
  if (inputTokens + requested > remaining) {
    const fitted = remaining - inputTokens;
    const structured = Boolean(format);
    if (fitted < MIN_GROQ_OUTPUT_TOKENS || (structured && fitted < requested * 0.75)) {
      return { allowed: false, reason: "window_budget_exhausted", inputTokens, requested, retryAfterMs: 60_000 };
    }
    completionCap = Math.floor(fitted);
  }
  const budget = reserveTokenBudget({ key: "groq", tokens: inputTokens + completionCap, limit });
  if (!budget.allowed) return { allowed: false, inputTokens, requested, retryAfterMs: budget.retryAfterMs };
  return { allowed: true, inputTokens, completionCap };
}

function usageOf(payload) {
  const usage = payload?.usage || {};
  return {
    promptTokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
    completionTokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null
  };
}

function logAttempt(entry) {
  console.info("[ellabrief-ai-attempt]", {
    provider: entry.provider || null,
    model: entry.model || null,
    stage: entry.stage || "reasoning",
    attempt: entry.attempt ?? null,
    formatMode: entry.formatMode || null,
    outcome: entry.outcome,
    kind: entry.kind || null,
    retryReason: entry.retryReason || null,
    providerStatus: entry.providerStatus ?? null,
    providerCode: entry.providerCode || null,
    promptTokenEstimate: entry.promptTokenEstimate ?? null,
    completionTokenCap: entry.completionTokenCap ?? null,
    promptTokens: entry.promptTokens ?? null,
    completionTokens: entry.completionTokens ?? null,
    durationMs: entry.durationMs ?? null,
    fallbackTriggered: Boolean(entry.fallbackTriggered),
    fallbackSucceeded: Boolean(entry.fallbackSucceeded)
  });
}

async function request({ provider, model, parts, systemInstruction, generationConfig = {}, timeout = 90000, fetchImpl = fetch, stream = false, formatMode = "none" }) {
  const key = provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;
  const base = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://openrouter.ai/api/v1";
  const format = responseFormat(generationConfig, provider, formatMode);
  const requestMessages = messages(parts, systemFor(systemInstruction, generationConfig, formatMode));
  const requestedOutput = Number(generationConfig.maxOutputTokens) > 0 ? Number(generationConfig.maxOutputTokens) : null;
  let promptTokenEstimate = estimateRequestTokens(requestMessages, 0);
  let completionTokenCap = requestedOutput;
  if (provider === "groq") {
    const plan = planGroqBudget({ requestMessages, format, requestedOutput });
    promptTokenEstimate = plan.inputTokens ?? promptTokenEstimate;
    if (!plan.allowed) throw Object.assign(budgetError(model, plan), { formatMode, promptTokenEstimate });
    completionTokenCap = plan.completionCap;
  }
  const body = {
    model,
    messages: requestMessages,
    temperature: generationConfig.temperature ?? 0.2,
    ...(completionTokenCap ? (provider === "groq" ? { max_completion_tokens: completionTokenCap } : { max_tokens: completionTokenCap }) : {}),
    ...(provider === "groq" ? groqControls(model) : {}),
    ...(format ? { response_format: format } : {}),
    stream
  };
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + key };
  if (provider === "openrouter") {
    headers["X-Title"] = "EllaBrief";
    if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  let response;
  try {
    response = await fetchImpl(base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (cause) {
    throw Object.assign(providerError(0, {}, cause, provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw Object.assign(providerError(response.status, payload, null, provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  }
  return { response, promptTokenEstimate, completionTokenCap, formatMode };
}

function responseText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(item => item?.text || "").join("");
  return "";
}

async function generateFrom(options, provider, model, formatMode) {
  const { response, promptTokenEstimate, completionTokenCap } = await request({ ...options, provider, model, formatMode, stream: false });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw Object.assign(providerError(502, {}, Object.assign(new Error("Invalid provider response"), { name: "EmptyResponseError" }), provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  }
  const text = responseText(payload);
  if (!text.trim()) throw Object.assign(providerError(502, {}, Object.assign(new Error("Empty response"), { name: "EmptyResponseError" }), provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  const finishReason = payload?.choices?.[0]?.finish_reason || "unknown";
  let validated;
  if (options.validateResponse) {
    try {
      validated = await options.validateResponse({ provider, model, text, payload, finishReason });
    } catch (cause) {
      throw Object.assign(providerError(502, {}, null, provider, model), {
        kind: "invalid_response",
        retry: true,
        validationError: String(cause?.message || "Invalid response").slice(0, 120),
        responseLength: text.length,
        finishReason,
        formatMode,
        promptTokenEstimate,
        completionTokenCap
      });
    }
  }
  return { provider, model, text, payload, finishReason, promptTokenEstimate, completionTokenCap, formatMode, ...usageOf(payload), ...(options.validateResponse ? { validated } : {}) };
}

function canUseSecondary(error) {
  return !error || error.retry || ["configuration", "provider_unavailable", "network_error", "rate_limit", "model_unavailable", "json_validation", "unsupported_format"].includes(error.kind);
}

function logFallback(from, to, error) {
  console.warn("[ellabrief-ai-fallback]", { from, to, kind: error?.kind || "provider_error", status: error?.providerStatus || null, model: error?.model || null });
}

function terminalError(last, meta) {
  return Object.assign(new Error("AI processing is temporarily unavailable. Please try again shortly."), {
    kind: last?.kind || "provider_unavailable",
    httpStatus: 503,
    userMessage: last?.userMessage || "AI processing is temporarily unavailable. Please try again shortly.",
    provider: last?.provider || null,
    model: last?.model || null,
    providerStatus: last?.providerStatus || null,
    providerCode: last?.providerCode || null,
    providerMessage: last?.providerMessage || null,
    validationError: last?.validationError || null,
    responseLength: last?.responseLength || null,
    retry: Boolean(last?.retry),
    formatMode: last?.formatMode || null,
    fallbackTriggered: Boolean(meta.fallbackTriggered),
    attempt: meta.attempt || null,
    attempts: meta.attempts
  });
}

async function runWithFallback(options, invoke) {
  let last = null;
  let attempt = 0;
  const attempts = [];
  const stage = options.stage || "reasoning";

  const consume = async (provider, models, viaFallback) => {
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const modes = formatModes(options.generationConfig, provider);
      if (i > 0) options.onFallback?.();
      for (let m = 0; m < modes.length; m++) {
        const formatMode = modes[m];
        attempt += 1;
        const started = Date.now();
        const fallbackTriggered = Boolean(viaFallback || i > 0 || m > 0);
        try {
          const remaining = Number.isFinite(options.deadlineAt) ? options.deadlineAt - Date.now() : Infinity;
          if (remaining <= 0) {
            throw Object.assign(new Error("The analysis request reached its processing deadline."), {
              kind: "processing_deadline",
              retry: false,
              provider,
              model,
              httpStatus: 503,
              userMessage: "This document set needs more processing time than one request can safely provide. Split it into smaller groups and try again."
            });
          }
          const attemptOptions = {
            ...options,
            timeout: Number.isFinite(remaining)
              ? Math.max(1, Math.min(Number(options.timeout) || 90000, remaining))
              : options.timeout
          };
          const result = await invoke(attemptOptions, provider, model, formatMode);
          logAttempt({
            provider, model, stage, attempt, formatMode, outcome: "success",
            promptTokenEstimate: result.promptTokenEstimate, completionTokenCap: result.completionTokenCap,
            promptTokens: result.promptTokens, completionTokens: result.completionTokens,
            durationMs: Date.now() - started, fallbackTriggered, fallbackSucceeded: fallbackTriggered
          });
          return { result: { ...result, attempt, fallbackTriggered, attempts } };
        } catch (error) {
          last = Object.assign(error, { formatMode: error.formatMode || formatMode });
          attempts.push({ provider, model, formatMode, kind: error.kind || "provider_error", providerStatus: error.providerStatus || null, providerCode: error.providerCode || null });
          logAttempt({
            provider, model, stage, attempt, formatMode, outcome: "failure", kind: error.kind || null,
            retryReason: error.kind || null, providerStatus: error.providerStatus || null, providerCode: error.providerCode || null,
            promptTokenEstimate: error.promptTokenEstimate ?? null, completionTokenCap: error.completionTokenCap ?? null,
            durationMs: Date.now() - started, fallbackTriggered, fallbackSucceeded: false
          });
          if ((error.kind === "json_validation" || error.kind === "unsupported_format") && m < modes.length - 1) continue;
          if (error.kind === "stream_interrupted") return { halt: true };
          if (!error.retry) return { stopModels: true };
          break;
        }
      }
    }
    return null;
  };

  let halted = false;
  if (process.env.GROQ_API_KEY) {
    const outcome = await consume("groq", getGroqReasoningModels(), false);
    if (outcome?.result) return outcome.result;
    halted = Boolean(outcome?.halt);
  } else last = Object.assign(new Error("Groq is not configured."), { kind: "configuration", retry: true, provider: "groq" });

  const allowOpenRouter = Boolean(process.env.OPENROUTER_API_KEY) && !halted && (canUseSecondary(last) || ["request_too_large", "json_validation", "unsupported_format"].includes(last?.kind));
  if (allowOpenRouter) {
    logFallback("groq", "openrouter", last);
    options.onFallback?.({ from: "groq", to: "openrouter", reason: last?.kind || "provider_error" });
    const outcome = await consume("openrouter", getOpenRouterModels(), true);
    if (outcome?.result) return outcome.result;
  }
  throw terminalError(last, { fallbackTriggered: allowOpenRouter, attempt, attempts });
}

export function generateWithFallback(options) {
  return runWithFallback(options, generateFrom);
}

async function streamFrom(options, provider, model, formatMode) {
  const { response, promptTokenEstimate, completionTokenCap } = await request({ ...options, provider, model, formatMode, stream: true });
  if (!response.body) throw Object.assign(providerError(503, {}, null, provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emitted = "";
  let promptTokens = null;
  let completionTokens = null;
  const consumeFrame = frame => {
    for (const line of frame.replace(/\r/g, "").split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }
      if (payload.error) throw providerError(502, payload, null, provider, model);
      const usage = usageOf(payload);
      if (usage.promptTokens != null) promptTokens = usage.promptTokens;
      if (usage.completionTokens != null) completionTokens = usage.completionTokens;
      const delta = payload.choices?.[0]?.delta?.content;
      const chunk = typeof delta === "string" ? delta : Array.isArray(delta) ? delta.map(item => item?.text || "").join("") : "";
      if (chunk) { emitted += chunk; options.onToken?.(chunk); }
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        consumeFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeFrame(buffer);
  } catch (error) {
    if (emitted) throw Object.assign(new Error("Stream interrupted."), { kind: "stream_interrupted", retry: false, provider, model, formatMode, userMessage: "The response was interrupted. Please ask again; no partial answer was saved." });
    throw Object.assign(error, { provider: error.provider || provider, model: error.model || model, formatMode });
  } finally {
    reader.releaseLock();
  }
  if (!emitted.trim()) throw Object.assign(providerError(502, {}, Object.assign(new Error("Empty response"), { name: "EmptyResponseError" }), provider, model), { formatMode, promptTokenEstimate, completionTokenCap });
  return { provider, model, text: emitted, promptTokenEstimate, completionTokenCap, formatMode, promptTokens, completionTokens };
}

export function streamWithFallback(options) {
  return runWithFallback(options, streamFrom);
}
