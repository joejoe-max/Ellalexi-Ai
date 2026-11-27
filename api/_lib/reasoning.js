import {
  estimateRequestTokens,
  reserveTokenBudget,
  releaseTokenBudget,
  settleTokenBudget
} from "./tokenBudget.js";

const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_OUTPUT_TOKENS = 1000;
const unique = values => [...new Set(values.filter(Boolean))];

export function getGroqReasoningModels() {
  const configured = String(process.env.GROQ_REASONING_MODELS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  return unique(configured.length ? configured : DEFAULT_GROQ_MODELS).slice(0, 4);
}
export function getOpenRouterModels() { return [OPENROUTER_MODEL]; }
export function getOpenRouterModel() { return OPENROUTER_MODEL; }

export function classifyReasoningError(status, payload = {}, cause) {
  const code = String(payload?.error?.code || payload?.error?.type || "").toLowerCase();
  const message = String(payload?.error?.message || "").toLowerCase();
  const blob = code + " " + message;
  if (cause?.name === "TimeoutError" || cause?.name === "AbortError") return { kind: "timeout", retry: true, message: "The AI service took too long to respond." };
  if (cause instanceof TypeError) return { kind: "network_error", retry: true, message: "The AI service could not be reached." };
  if (cause?.name === "EmptyResponseError") return { kind: "empty_response", retry: true, message: "The AI service returned an empty response." };
  if ((status === 413 && /rate_limit|tpm|quota/.test(blob)) || status === 429 || /rate_limit|quota|too_many_requests/.test(code)) return { kind: "rate_limit", retry: true, message: "The AI service is temporarily busy." };
  if (/json_validate_failed|failed to validate json|failed_generation/.test(blob)) return { kind: "json_validation", retry: true, message: "The AI service could not produce valid structured output." };
  if ((status === 400 || status === 422) && /response_format|json_schema|structured output/.test(blob)) return { kind: "unsupported_format", retry: true, message: "The AI model does not support the requested response format." };
  if (status === 413) return { kind: "request_too_large", retry: false, message: "The document context is too large for the AI provider request." };
  if (status === 404 || /model_not_found|model_unavailable/.test(code)) return { kind: "model_unavailable", retry: true, message: "The selected AI model is unavailable." };
  if ([500, 502, 503, 504].includes(status)) return { kind: "provider_unavailable", retry: true, message: "The AI service is temporarily unavailable." };
  if (status === 401 || status === 403) return { kind: "configuration", retry: false, message: "The AI provider could not authenticate the request." };
  if (status === 400 || status === 422) return { kind: "invalid_request", retry: false, message: "The AI request could not be processed." };
  return { kind: "provider_error", retry: false, message: "The AI request failed." };
}

export function classifyProviderPayload(payload) {
  const choice = payload?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { kind: "empty_response", detail: "missing_content" };
  if (choice.finish_reason === "length") return { kind: "truncated_response", detail: "finish_reason_length" };
  return { kind: "ok" };
}

function toMessages(parts = [], systemInstruction) {
  const content = parts.map(part => {
    if (typeof part?.text === "string") return part.text;
    if (part?.inlineData?.data) return "[Inline document data omitted from text conversion.]";
    return "";
  }).filter(Boolean).join("\n\n");
  return [
    ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
    { role: "user", content }
  ];
}
function responseFormat(config = {}, mode = "schema") {
  if (config.responseMimeType !== "application/json") return undefined;
  if (mode === "object" || !config.responseSchema) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: "ellabrief_response",
      strict: false,
      schema: config.responseSchema
    }
  };
}
function makeBody({ model, messages, generationConfig = {}, jsonMode = "schema" }) {
  const maxTokens = Math.max(256, Number(generationConfig.maxOutputTokens || DEFAULT_OUTPUT_TOKENS));
  const body = {
    model,
    messages,
    temperature: Number.isFinite(generationConfig.temperature) ? generationConfig.temperature : 0.2,
    max_tokens: maxTokens,
    stream: false
  };
  const format = responseFormat(generationConfig, jsonMode);
  if (format) body.response_format = format;
  if (model.includes("gpt-oss")) body.reasoning_effort = "low";
  return body;
}
function safeLog(stage, provider, model, kind) {
  console.info("[ellabrief-reasoning]", { stage: String(stage || "reasoning").slice(0, 50), provider, model, kind });
}
function makeError(classified, provider, model, status, payload) {
  const error = new Error(classified.message);
  Object.assign(error, classified, {
    provider, model, httpStatus: classified.kind === "invalid_request" ? 400 : 503,
    providerStatus: status || null,
    providerCode: String(payload?.error?.code || "").slice(0, 80)
  });
  return error;
}
function parseContent(payload) {
  const result = classifyProviderPayload(payload);
  if (result.kind !== "ok") {
    const error = new Error(result.detail);
    error.name = result.kind === "empty_response" ? "EmptyResponseError" : "Error";
    error.kind = result.kind;
    error.retry = true;
    throw error;
  }
  return payload.choices[0].message.content;
}
function actualTokens(payload, fallback) {
  const usage = payload?.usage;
  const total = Number(usage?.total_tokens || (Number(usage?.prompt_tokens || 0) + Number(usage?.completion_tokens || 0)));
  return Number.isFinite(total) && total > 0 ? total : fallback;
}

export async function generateWithFallback({
  stage, parts = [], systemInstruction, generationConfig = {}, timeout = 45000,
  deadlineAt, onFallback, fetchImpl = fetch
} = {}) {
  if (Number.isFinite(deadlineAt) && deadlineAt <= Date.now()) {
    throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
  }
  const messages = toMessages(parts, systemInstruction);
  const groqKey = process.env.GROQ_API_KEY;
  const routerKey = process.env.OPENROUTER_API_KEY;
  const groqModels = groqKey ? getGroqReasoningModels() : [];
  const routerModels = routerKey ? getOpenRouterModels() : [];
  if (!groqModels.length && !routerModels.length) {
    throw Object.assign(new Error("No reasoning provider is configured."), { kind: "configuration", httpStatus: 503, userMessage: "EllaBrief's AI service is not configured yet. Please try again later." });
  }
  const candidates = [
    ...groqModels.map(model => ({ provider: "groq", model, key: groqKey, url: "https://api.groq.com/openai/v1/chat/completions" })),
    ...routerModels.map(model => ({ provider: "openrouter", model, key: routerKey, url: "https://openrouter.ai/api/v1/chat/completions" }))
  ];
  let lastError;
  let fallbackTriggered = false;
  const outputTokens = Math.max(256, Number(generationConfig.maxOutputTokens || DEFAULT_OUTPUT_TOKENS));
  for (const candidate of candidates) {
    if (Number.isFinite(deadlineAt) && deadlineAt - Date.now() <= 0) {
      throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
    }
    const estimate = estimateRequestTokens(messages, outputTokens);
    const budget = candidate.provider === "groq"
      ? reserveTokenBudget({ key: "groq", tokens: estimate, limit: Number(process.env.GROQ_LOCAL_TPM_BUDGET || 14000) })
      : { allowed: true };
    if (!budget.allowed) {
      lastError = Object.assign(new Error("The local Groq token budget is exhausted."), { kind: "local_token_budget", retry: true });
      fallbackTriggered = true;
      onFallback?.(candidate.model);
      continue;
    }
    let jsonMode = "schema";
    for (let attempt = 0; attempt < (candidate.provider === "groq" && responseFormat(generationConfig) ? 2 : 1); attempt++) {
      const remaining = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : timeout;
      if (remaining <= 0) {
        if (budget.reservation) releaseTokenBudget({ key: "groq", reservation: budget.reservation });
        throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
      }
      const requestTimeout = Math.max(1, Math.min(timeout, remaining));
      try {
        const response = await fetchImpl(candidate.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + candidate.key,
            ...(candidate.provider === "openrouter" ? { "HTTP-Referer": process.env.APP_URL || "https://ellabrief.com", "X-Title": "EllaBrief" } : {})
          },
          body: JSON.stringify(makeBody({ ...candidate, messages, generationConfig, jsonMode })),
          signal: AbortSignal.timeout(requestTimeout)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const classified = classifyReasoningError(response.status, payload);
          lastError = makeError(classified, candidate.provider, candidate.model, response.status, payload);
          safeLog(stage, candidate.provider, candidate.model, classified.kind);
          if (classified.kind === "json_validation" && candidate.provider === "groq" && attempt === 0) {
            jsonMode = "object";
            continue;
          }
          if (budget.reservation) releaseTokenBudget({ key: "groq", reservation: budget.reservation });
          if (!classified.retry) throw lastError;
          break;
        }
        const text = parseContent(payload);
        const usage = actualTokens(payload, estimate);
        if (budget.reservation) settleTokenBudget({ key: "groq", reservation: budget.reservation, actualTokens: usage });
        return {
          provider: candidate.provider, model: candidate.model, text, payload,
          finishReason: payload.choices?.[0]?.finish_reason || "stop",
          fallbackTriggered
        };
      } catch (cause) {
        if (budget.reservation) releaseTokenBudget({ key: "groq", reservation: budget.reservation });
        if (cause?.provider) lastError = cause;
        else {
          const classified = classifyReasoningError(0, {}, cause);
          lastError = makeError({ ...classified, retry: cause?.retry ?? classified.retry }, candidate.provider, candidate.model, 0, {});
        }
        safeLog(stage, candidate.provider, candidate.model, lastError.kind || "provider_error");
        if (!lastError.retry) throw lastError;
        break;
      }
    }
    fallbackTriggered = true;
    const next = candidates[candidates.indexOf(candidate) + 1];
    if (next) onFallback?.(next.model);
  }
  throw lastError || Object.assign(new Error("The AI service is unavailable."), { kind: "provider_unavailable", httpStatus: 503 });
}

export async function streamWithFallback({
  stage, parts = [], systemInstruction, generationConfig = {}, timeout = 60000,
  deadlineAt, onToken, onFallback, fetchImpl = fetch
} = {}) {
  const messages = toMessages(parts, systemInstruction);
  const candidates = [
    ...(process.env.GROQ_API_KEY ? getGroqReasoningModels().map(model => ({ provider: "groq", model, key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions" })) : []),
    ...(process.env.OPENROUTER_API_KEY ? getOpenRouterModels().map(model => ({ provider: "openrouter", model, key: process.env.OPENROUTER_API_KEY, url: "https://openrouter.ai/api/v1/chat/completions" })) : [])
  ];
  if (!candidates.length) throw Object.assign(new Error("No reasoning provider is configured."), { kind: "configuration", httpStatus: 503 });
  let lastError;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const remaining = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : timeout;
    if (remaining <= 0) throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
    let emitted = "";
    try {
      const response = await fetchImpl(candidate.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + candidate.key },
        body: JSON.stringify({ ...makeBody({ ...candidate, messages, generationConfig }), stream: true }),
        signal: AbortSignal.timeout(Math.min(timeout, remaining))
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const classified = classifyReasoningError(response.status, payload);
        lastError = makeError(classified, candidate.provider, candidate.model, response.status, payload);
        safeLog(stage, candidate.provider, candidate.model, classified.kind);
        if (!classified.retry) throw lastError;
      } else if (!response.body) {
        throw Object.assign(new Error("The provider returned no stream."), { kind: "empty_response", retry: true });
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = frame => {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            let payload;
            try { payload = JSON.parse(raw); } catch { continue; }
            const delta = payload.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              emitted += delta;
              onToken?.(delta);
            }
          }
        };
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
              consume(buffer.slice(0, boundary));
              buffer = buffer.slice(boundary + 2);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);
        } finally { reader.releaseLock(); }
        if (emitted.trim()) return { provider: candidate.provider, model: candidate.model, text: emitted };
        lastError = Object.assign(new Error("The provider returned an empty stream."), { kind: "empty_response", retry: true });
      }
    } catch (cause) {
      if (emitted) throw Object.assign(new Error("The response stream was interrupted."), { kind: "stream_interrupted", httpStatus: 502, userMessage: "The response was interrupted. Please ask again; no partial answer was saved." });
      lastError = cause?.provider ? cause : Object.assign(new Error("The AI service could not complete the stream."), { ...classifyReasoningError(0, {}, cause), retry: true });
    }
    if (emitted) throw Object.assign(new Error("The response stream was interrupted."), { kind: "stream_interrupted", httpStatus: 502 });
    if (index < candidates.length - 1) onFallback?.(candidates[index + 1].model);
  }
  throw lastError || Object.assign(new Error("The AI service is unavailable."), { kind: "provider_unavailable", httpStatus: 503 });
}
