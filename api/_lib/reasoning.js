import { estimateRequestTokens } from "./tokenBudget.js";

const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
// OpenRouter maintains this router ID and selects an eligible free chat model dynamically.
// The previous pinned GPT-OSS :free variant returned HTTP 404 at runtime.
const OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_OUTPUT_TOKENS = 1000;

export function getGroqReasoningModels() {
  return [...DEFAULT_GROQ_MODELS];
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
  const message = choice?.message;
  const content = message?.content;
  const diagnostics = {
    choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0,
    finishReason: choice?.finish_reason || null,
    messageContentType: Array.isArray(content) ? "array" : typeof content,
    messageContentLength: typeof content === "string" ? content.length : null,
    reasoningContentLength: typeof message?.reasoning === "string" ? message.reasoning.length : null,
    refusalPresent: Boolean(message?.refusal),
    toolCallCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
    promptTokens: Number(payload?.usage?.prompt_tokens || 0) || null,
    completionTokens: Number(payload?.usage?.completion_tokens || 0) || null
  };
  if (choice?.finish_reason === "length") return { kind: "truncated_response", detail: "finish_reason_length", diagnostics };
  if (typeof content !== "string" || !content.trim()) {
    return { kind: "empty_response", detail: !choice ? "missing_choice" : "missing_content", diagnostics };
  }
  return { kind: "ok", diagnostics };
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
function normalizeJsonSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") result[key] = value.toLowerCase();
    else if (key === "properties" && value && typeof value === "object") {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, normalizeJsonSchema(child)]));
    } else if (key === "items") result[key] = normalizeJsonSchema(value);
    else result[key] = value;
  }
  return result;
}
function responseFormat(config = {}, mode = "schema") {
  if (config.responseMimeType !== "application/json") return undefined;
  if (mode === "object" || !config.responseSchema) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: "ellabrief_response",
      strict: false,
      schema: normalizeJsonSchema(config.responseSchema)
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
function safeLog(stage, provider, model, kind, details = {}) {
  // Never log prompts, document text, API keys, or provider response bodies.
  console.info("[ellabrief-reasoning]", {
    stage: String(stage || "reasoning").slice(0, 50), provider, model, kind,
    ...details
  });
}
function safeCauseDetails(cause) {
  const name = String(cause?.name || "Error").slice(0, 80);
  const code = String(cause?.code || cause?.cause?.code || "").slice(0, 80) || null;
  const kind = cause?.kind || null;
  const messageByKind = {
    timeout: "Provider request timed out",
    network_error: "Provider network request failed",
    empty_response: "Provider returned no usable assistant content",
    truncated_response: "Provider output reached its token limit",
    invalid_response: "Application validation rejected provider output",
    provider_error: "Provider request failed"
  };
  return {
    errorName: name,
    errorCode: code,
    errorKind: kind,
    errorSummary: messageByKind[kind] || (cause instanceof TypeError ? "Network/fetch failure" : "Provider request failed")
  };
}
function rateLimitHeaders(headers) {
  if (!headers?.get) return {};
  const names = [
    "retry-after", "x-ratelimit-limit-requests", "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-requests", "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"
  ];
  return Object.fromEntries(names.map(name => [name, headers.get(name)]).filter(([, value]) => value !== null));
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
    error.responseDiagnostics = result.diagnostics;
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
  deadlineAt, onFallback, fetchImpl = fetch, validateResponse
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
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    if (Number.isFinite(deadlineAt) && deadlineAt - Date.now() <= 0) {
      throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
    }
    const estimate = estimateRequestTokens(messages, outputTokens);
    // No in-memory TPM preflight: Vercel instances do not share state.
    // Groq's organization-level limits and response headers are authoritative.
    safeLog(stage, candidate.provider, candidate.model, "attempt", {
      attempt: candidateIndex + 1, estimatedTokens: estimate, outputTokenLimit: outputTokens
    });
    let jsonMode = "schema";
    for (let attempt = 0; attempt < (generationConfig.responseMimeType === "application/json" ? 2 : 1); attempt++) {
      const remaining = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : timeout;
      if (remaining <= 0) {
        throw Object.assign(new Error("The shared processing deadline has expired."), { kind: "processing_deadline", httpStatus: 503 });
      }
      const requestTimeout = Math.max(1, Math.min(timeout, remaining));
      try {
        const response = await fetchImpl(candidate.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + candidate.key,
            ...(candidate.provider === "openrouter" ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL || process.env.APP_URL || "https://ellabrief.com", "X-Title": "EllaBrief" } : {})
          },
          body: JSON.stringify(makeBody({ ...candidate, messages, generationConfig, jsonMode })),
          signal: AbortSignal.timeout(requestTimeout)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const classified = classifyReasoningError(response.status, payload);
          // A rejected Groq credential should bypass the remaining Groq models
          // and try the independently configured OpenRouter credential.
          if (candidate.provider === "groq" && routerKey && classified.kind === "configuration") {
            classified.retry = true;
            const routerIndex = candidates.findIndex(item => item.provider === "openrouter");
            if (routerIndex >= 0) candidateIndex = routerIndex - 1;
          }
          lastError = makeError(classified, candidate.provider, candidate.model, response.status, payload);
          safeLog(stage, candidate.provider, candidate.model, classified.kind, {
            status: response.status,
            providerCode: String(payload?.error?.code || payload?.error?.type || "").slice(0, 80) || null,
            responseLength: 0,
            rateLimits: rateLimitHeaders(response.headers)
          });
          if (["json_validation", "unsupported_format"].includes(classified.kind) && attempt === 0) {
            jsonMode = "object";
            continue;
          }
          if (!classified.retry) throw lastError;
          break;
        }
        const text = parseContent(payload);
        let validated;
        if (validateResponse) {
          try {
            validated = await validateResponse({ provider: candidate.provider, model: candidate.model, text, payload, finishReason: payload.choices?.[0]?.finish_reason || "stop" });
          } catch (cause) {
            lastError = Object.assign(new Error("The provider response failed application validation."), {
              kind: "invalid_response", retry: true, provider: candidate.provider,
              model: candidate.model, httpStatus: 502
            });
            safeLog(stage, candidate.provider, candidate.model, "invalid_response", {
              ...safeCauseDetails(cause),
              ...classifyProviderPayload(payload).diagnostics,
              validationErrorName: String(cause?.name || "Error").slice(0, 80),
              validationErrorMessage: String(cause?.message || "Validation failed").slice(0, 180),
              validationIssueCount: Array.isArray(cause?.issues) ? cause.issues.length : null,
              validationIssueCodes: Array.isArray(cause?.issues) ? cause.issues.slice(0, 8).map(issue => String(issue?.code || "unknown").slice(0, 40)) : []
            });
            if (attempt === 0 && jsonMode === "schema") {
              jsonMode = "object";
              continue;
            }
            break;
          }
        }
        const usage = actualTokens(payload, estimate);
        safeLog(stage, candidate.provider, candidate.model, "success", {
          status: response.status,
          estimatedTokens: estimate,
          promptTokens: Number(payload?.usage?.prompt_tokens || 0) || null,
          completionTokens: Number(payload?.usage?.completion_tokens || 0) || null,
          totalTokens: usage,
          responseLength: text.length,
          finishReason: payload.choices?.[0]?.finish_reason || "stop",
          rateLimits: rateLimitHeaders(response.headers)
        });
        return {
          provider: candidate.provider, model: candidate.model, text, payload,
          finishReason: payload.choices?.[0]?.finish_reason || "stop",
          ...(validateResponse ? { validated } : {}),
          fallbackTriggered
        };
      } catch (cause) {
        if (cause?.provider) lastError = cause;
        else {
          const classified = classifyReasoningError(0, {}, cause);
          lastError = makeError({ ...classified, retry: cause?.retry ?? classified.retry }, candidate.provider, candidate.model, 0, {});
        }
        safeLog(stage, candidate.provider, candidate.model, lastError.kind || "provider_error", {
          ...safeCauseDetails(cause),
          providerStatus: lastError.providerStatus || null,
          providerCode: lastError.providerCode || null,
          ...(cause?.responseDiagnostics || {})
        });
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
    safeLog(stage, candidate.provider, candidate.model, "stream_attempt", { attempt: index + 1 });
    try {
      const response = await fetchImpl(candidate.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + candidate.key,
          ...(candidate.provider === "openrouter" ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL || process.env.APP_URL || "https://ellabrief.com", "X-Title": "EllaBrief" } : {})
        },
        body: JSON.stringify({ ...makeBody({ ...candidate, messages, generationConfig }), stream: true }),
        signal: AbortSignal.timeout(Math.min(timeout, remaining))
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const classified = classifyReasoningError(response.status, payload);
        lastError = makeError(classified, candidate.provider, candidate.model, response.status, payload);
        safeLog(stage, candidate.provider, candidate.model, classified.kind, {
          status: response.status,
          providerCode: String(payload?.error?.code || payload?.error?.type || "").slice(0, 80) || null,
          responseLength: 0,
          rateLimits: rateLimitHeaders(response.headers)
        });
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
        if (emitted.trim()) {
          safeLog(stage, candidate.provider, candidate.model, "stream_success", {
            status: response.status, responseLength: emitted.length,
            rateLimits: rateLimitHeaders(response.headers)
          });
          return { provider: candidate.provider, model: candidate.model, text: emitted };
        }
        lastError = Object.assign(new Error("The provider returned an empty stream."), { kind: "empty_response", retry: true });
      }
    } catch (cause) {
      if (emitted) throw Object.assign(new Error("The response stream was interrupted."), { kind: "stream_interrupted", httpStatus: 502, userMessage: "The response was interrupted. Please ask again; no partial answer was saved." });
      lastError = cause?.provider ? cause : Object.assign(new Error("The AI service could not complete the stream."), { ...classifyReasoningError(0, {}, cause), retry: true });
      safeLog(stage, candidate.provider, candidate.model, lastError.kind || "stream_error", {
        ...safeCauseDetails(cause),
        providerStatus: lastError.providerStatus || null,
        providerCode: lastError.providerCode || null,
        responseLength: emitted.length
      });
    }
    if (emitted) throw Object.assign(new Error("The response stream was interrupted."), { kind: "stream_interrupted", httpStatus: 502 });
    if (index < candidates.length - 1) onFallback?.(candidates[index + 1].model);
  }
  throw lastError || Object.assign(new Error("The AI service is unavailable."), { kind: "provider_unavailable", httpStatus: 503 });
}
