# AI API v1 — DXOS-AI-002, agent update DXOS-AI-003

`POST /api/v1/organizations/:organizationId/ai/generate` is the tenant-scoped AI chat boundary. The caller must present a valid bearer JWT, an active account, an `ACTIVE` membership in the path organization, and an explicit `ai:use` permission. The route organization and permission decision are always derived from the authenticated request context; a client supplied organization, actor, provider, permission list, role, tool or privilege field is rejected or ignored. Cross-tenant access returns the existing safe `403 FORBIDDEN` envelope.

## Request (unchanged)

```json
{
  "messages": [
    { "role": "user", "content": "Có việc nào đang quá hạn không?" },
    { "role": "assistant", "content": "Có 2 công việc quá hạn: ..." },
    { "role": "user", "content": "Việc thứ nhất của ai?" }
  ],
  "model": "gpt-oss:120b",
  "maxOutputTokens": 256,
  "temperature": 0,
  "metadata": { "purpose": "general" }
}
```

`messages` contains 1–16 `user` or `assistant` messages. A message is non-blank and at most 4,000 characters; combined content is at most 16,000 UTF-16 units and 64,000 UTF-8 bytes. `model` is optional and, when supplied, must equal the server configured model. `maxOutputTokens` is 1–2,048 (default 256; per model call), `temperature` is 0–2 (default 0), and metadata is optional, exactly `{ "purpose": "general" }`, and at most 256 UTF-8 bytes. `system`, `developer`, `tool`, tool definitions, tool calls and arbitrary options are not accepted: tools are chosen by the server. Conversation state is supplied by the client for each request; no conversation table is created. The web client keeps the conversation in memory for the signed-in session (per user and organization) so it survives page navigation, and discards it on logout, organization switch, "Xóa hội thoại" or page reload; it is never written to browser storage.

## Behaviour (DXOS-AI-003)

When the configured provider supports tool calling (`mock`, `ollama`, `vllm`) the request runs a bounded read-only agent:

1. The server computes the caller's effective permissions and describes to the model only the tools the caller may use (12 data tools plus `calculate`, see [spec 9.3](../../docs/architecture/ai-agent-v1-spec.md)). The system prompt holds no business data: only the organization name, the caller's own profile (name, employee code, job title, department; sanitized, no contact data, so "tôi là ai / tôi làm phòng nào" is answered without a tool) and the current time.
2. The model may request tools; each call is validated (known name, class-validator arguments, no unknown fields, no tenant/actor fields), re-checks its permission in the organization, runs a read-only query of the owning module and returns an allowlisted, size-bounded JSON result. Phone numbers, e-mails, GPS positions, leave reasons, reviewer notes, individual salaries and ratings are never returned; sensitive document titles require `document:sensitive:read`.
3. At most 3 tool rounds with 3 calls each; each model call is bounded by `AI_TIMEOUT_MS`, the whole request by `AI_AGENT_TOTAL_TIMEOUT_MS`. If the model still wants tools after the budget, it must answer without them and `finishReason` is `tool_limit`.
4. Model reasoning is dropped inside the adapter. Every number in the answer is compared with the numbers the request saw (tool results, user messages, current date); the result is reported in `numericCheck` (warning only).

Providers without tool calling (`openai`, `gemini`) keep the single-call legacy path; `citations` is then empty and `numericCheck` is `NOT_APPLICABLE`.

## Response

Only normalized data is returned. Fields marked *added* are additive; existing clients can ignore them.

```json
{
  "id": "uuid",
  "organizationId": "uuid",
  "requestId": "opaque-correlation-id",
  "provider": "mock|ollama|vllm|openai|gemini",
  "model": "server-selected model",
  "text": "untrusted assistant text",
  "finishReason": "stop|length|tool_limit",
  "usage": { "inputTokens": 1450, "outputTokens": 90, "totalTokens": 1540 },
  "citations": [
    { "type": "task", "id": "uuid", "label": "Báo cáo Q3", "href": "/tasks/uuid" }
  ],
  "numericCheck": { "status": "PASS|WARN|NOT_APPLICABLE", "unmatchedCount": 0 }
}
```

- `finishReason`: `tool_limit` is *added*.
- `usage` sums every model call of the request, so `outputTokens` may exceed `maxOutputTokens`.
- `citations` (*added*): at most 30 records the answer is based on, only from tool results of this request. `type` ∈ task, approval, leave, document, employee, department, event, attendance, schedule, metric; `href` is always an internal frontend route (validated server-side); `id` may be null for list pages.
- `numericCheck` (*added*): `WARN` with `unmatchedCount` when the answer contains numbers that do not appear in the data the request saw.

`numericCheck.status=PASS` means only that numeric values appeared in the available context, not that their meaning,
unit, subject or conclusion is correct. For example, a source containing 10 tasks cannot verify a claim of 10 employees.
Clients must not label this result as factual verification; the web client explains this limitation for numeric answers.
Use source links to confirm the actual records. This check does not prevent all model hallucinations.

Provider payloads, headers, stack traces, prompts, responses, tool arguments and tool results, credentials and internal URLs are never returned or persisted. The `AiRequest` row stores tenant/actor, provider/model, request correlation, bounded usage, lifecycle status, error category and latency only. Audit records contain `ai.request.started`, `ai.request.succeeded` or `ai.request.failed` and request correlation; they never contain conversation content. Structured logs record per step and per tool only names, outcomes, counts and latency (`ai_agent_step`, `ai_tool_invoked`, `ai_numeric_check`, `ai_agent_completed`).

## Configuration

| Variable | Values |
| --- | --- |
| `AI_PROVIDER` | `mock` (dev/test default), `ollama`, `vllm`, `openai`, `gemini`, `disabled` (production default) |
| `AI_BASE_URL` | `ollama`/`vllm` only; absolute http(s) URL without credentials, query or fragment; server configuration only. Default for `ollama`: `http://localhost:11434/v1` |
| `AI_MODEL` | Default `mock-v1`, `gpt-oss:120b` (ollama), `openai/gpt-oss-120b` (vllm) |
| `AI_API_KEY` | Required for hosted APIs and Ollama Cloud outside `NODE_ENV=test`; optional for self-hosted servers. Server-only (OpenBao in the full stack), excluded from validated environment output and logs |
| `AI_TIMEOUT_MS` | Per model call, 1–30,000; default 30,000 for `ollama`/`vllm`, 5,000 otherwise |
| `AI_REASONING_EFFORT` | `low` (default), `medium`, `high` |
| `AI_AGENT_MAX_STEPS` | Tool rounds, 1–5 (default 3) |
| `AI_AGENT_TOTAL_TIMEOUT_MS` | 1,000–120,000 (default 45,000) |

The adapter uses `redirect: 'error'`, the request abort signal and no automatic retry. With `AI_PROVIDER=mock` the deterministic offline provider recognises sample questions, calls the same tools and writes its answer only from their results.

## Errors

Errors use the existing `ErrorResponse` envelope and request ID: `400 VALIDATION_FAILED`/`AI_INVALID_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (also when access is revoked during the request), `429 AI_LIMIT_EXCEEDED`, `503 AI_PROVIDER_UNAVAILABLE` for disabled/timeout/transport/5xx failures, `502 AI_PROVIDER_ERROR` for safe provider or malformed-response failures (including unknown fields in a provider response), and `500 AI_INTERNAL_ERROR` for persistence/lifecycle failures. A failing tool does not fail the request: the model receives `DENIED`, `EMPTY`, `INVALID_ARGUMENTS` or `UNAVAILABLE` and answers accordingly.

No database schema or migration change is required. The endpoint is non-streaming, has no history/read endpoint, and adds no RAG, vectors, write tools, autonomous actions, document-content retrieval or notification side effects.
