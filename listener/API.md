# Listener Service API

Base URL: `http://localhost:8787` (configured via `EVENTS_API_PORT`)

---

## Events

### GET /api/events

Returns all stored contract events.

**Query Parameters**

| Name  | Type   | Required | Description                        |
|-------|--------|----------|------------------------------------|
| limit | number | No       | Maximum number of events to return |

**Response `200`**

```json
{
  "count": 42,
  "events": [
    {
      "eventId": "string",
      "contractAddress": "string",
      "eventName": "string | null",
      "ledger": 12345,
      "type": "contract",
      "topic": ["TaskCreated"],
      "value": "string",
      "txHash": "string",
      "receivedAt": 1718640000000
    }
  ]
}
```

---

## User Notification Preferences

Preferences control which notification categories are delivered per user. Categories default to **enabled** when not explicitly set.

### GET /api/preferences/:userId

Returns the notification preferences for a user.

**Path Parameters**

| Name   | Description        |
|--------|--------------------|
| userId | User identifier    |

**Response `200`**

```json
{
  "userId": "alice",
  "categories": {
    "discord": true
  },
  "updatedAt": 1718640000000
}
```

---

### PUT /api/preferences/:userId

Updates one or more notification category flags for a user. Unspecified categories are preserved.

**Path Parameters**

| Name   | Description        |
|--------|--------------------|
| userId | User identifier    |

**Request Body**

```json
{
  "categories": {
    "discord": false
  }
}
```

| Field      | Type                          | Required | Description                              |
|------------|-------------------------------|----------|------------------------------------------|
| categories | `Record<string, boolean>`     | Yes      | Map of category name to enabled flag     |

**Response `200`** — returns the full updated preferences object.

```json
{
  "userId": "alice",
  "categories": {
    "discord": false
  },
  "updatedAt": 1718640100000
}
```

**Response `400`** — returned when the request body is invalid JSON or the `categories` field is missing.

```json
{ "error": "Invalid body: expected { categories: { [key]: boolean } }" }
```

---

## Notification Categories

| Category  | Description                  |
|-----------|------------------------------|
| `discord` | Discord webhook notifications |

Additional categories can be added by extending the `categories` map.

---

## Per-Contract User Binding

To apply user preferences to a specific contract's events, set `userId` in the contract address config:

```json
{
  "CONTRACT_ADDRESSES": [
    {
      "address": "CCEMX6...",
      "events": ["*"],
      "userId": "alice"
    }
  ]
}
```

If `userId` is omitted, the `"global"` user's preferences are applied.

---

## Scheduled Notifications

### POST /api/schedule

Schedules a notification for future delivery.

**Request Body**

```json
{
  "executeAt": "2024-06-20T15:00:00.000Z",
  "payload": { "content": "Your task was completed." },
  "targetRecipient": "https://discord.com/api/webhooks/...",
  "notificationType": "discord",
  "maxRetries": 3,
  "priority": 1,
  "eventId": "abc123",
  "contractAddress": "CCEMX6...",
  "metadata": {}
}
```

| Field             | Type     | Required | Description                                              |
|-------------------|----------|----------|----------------------------------------------------------|
| executeAt         | string   | Yes      | ISO 8601 datetime — when to deliver the notification     |
| payload           | object   | Yes      | Arbitrary data forwarded to the notification handler     |
| targetRecipient   | string   | Yes      | Delivery target (e.g. Discord webhook URL)               |
| notificationType  | string   | No       | `"discord"` (default)                                    |
| maxRetries        | number   | No       | Override max retry count                                 |
| priority          | number   | No       | Lower numbers run first                                  |
| eventId           | string   | No       | Correlation ID linking this to a contract event          |
| contractAddress   | string   | No       | Contract that triggered the notification                 |
| metadata          | object   | No       | Arbitrary key/value metadata                             |

**Response `201`**

```json
{ "id": 42 }
```

**Response `400`** — missing required fields

```json
{ "error": "Missing required fields: executeAt, payload, targetRecipient" }
```

**Response `400`** — `executeAt` cannot be parsed as a date

```json
{ "error": "executeAt is not a valid date" }
```

**Response `500`** — internal scheduling failure

```json
{ "error": "Failed to insert notification into database" }
```

**Response `503`** — scheduler feature is disabled

```json
{ "error": "Scheduler not enabled" }
```

---

### GET /api/schedule/:id

Returns a single scheduled notification by its numeric ID.

**Path Parameters**

| Name | Description              |
|------|--------------------------|
| id   | Notification ID (integer) |

**Response `200`**

```json
{
  "id": 42,
  "executeAt": "2024-06-20T15:00:00.000Z",
  "payload": { "content": "Your task was completed." },
  "targetRecipient": "https://discord.com/api/webhooks/...",
  "notificationType": "discord",
  "status": "pending",
  "retries": 0,
  "maxRetries": 3,
  "priority": 1,
  "eventId": "abc123",
  "contractAddress": "CCEMX6...",
  "metadata": null,
  "createdAt": 1718640000000
}
```

**Response `400`** — non-numeric `:id`

```json
{ "error": "Invalid notification ID" }
```

**Response `404`** — no notification with that ID

```json
{ "error": "Notification not found" }
```

**Response `500`** — database read failure

```json
{ "error": "SQLITE_ERROR: ..." }
```

**Response `503`** — scheduler feature is disabled

```json
{ "error": "Scheduler not enabled" }
```

---

### GET /api/schedule/stats

Returns aggregate statistics about the scheduled-notification queue.

**Response `200`**

```json
{
  "total": 100,
  "pending": 20,
  "delivered": 75,
  "failed": 5
}
```

**Response `500`** — database read failure

```json
{ "error": "SQLITE_ERROR: ..." }
```

**Response `503`** — scheduler feature is disabled

```json
{ "error": "Scheduler not enabled" }
```

---

## Notification Delivery History

### GET /api/notifications/history

Returns paginated delivery execution records from `notification_execution_log`.

**Query Parameters**

| Name      | Type   | Required | Description                                                       |
|-----------|--------|----------|-------------------------------------------------------------------|
| limit     | number | No       | Maximum records per page (default `20`, max `100`)                |
| offset    | number | No       | Number of records to skip (default `0`)                           |
| status    | string | No       | Filter by execution status: `SUCCESS`, `FAILED`, or `RETRY`       |
| startDate | string | No       | ISO 8601 lower bound on `execution_time` (inclusive)              |
| endDate   | string | No       | ISO 8601 upper bound on `execution_time` (inclusive)              |

**Response `200`**

```json
{
  "records": [
    {
      "id": 1,
      "scheduledNotificationId": 42,
      "executionAttempt": 1,
      "executionTime": "2024-06-20T15:00:00.000Z",
      "status": "SUCCESS",
      "errorMessage": null,
      "responseDuration": 120
    }
  ],
  "total": 5,
  "itemCount": 5,
  "totalPages": 3,
  "limit": 2,
  "offset": 0
}
```

| Field       | Type   | Description                                                                 |
|-------------|--------|-----------------------------------------------------------------------------|
| records     | array  | Execution log entries for the current page                                  |
| total       | number | Total matching records (preserved for backward compatibility; same value as `itemCount`) |
| itemCount   | number | Total number of records matching the query filters                          |
| totalPages  | number | Total pages available at the requested `limit` (`0` when `itemCount` is `0`) |
| limit       | number | Effective page size applied to the query                                    |
| offset      | number | Number of records skipped before this page                                  |

Existing clients that read `total`, `limit`, `offset`, and `records` continue to work unchanged. New clients should prefer `itemCount` and `totalPages` for pagination UI.

**Response `500`** — database read failure

```json
{ "error": "SQLITE_ERROR: ..." }
```

---

## Webhooks

### POST /api/webhooks

Receives a signed webhook event payload. The request must carry a valid HMAC-SHA256 signature produced with a pre-shared secret.

**Required Headers**

| Header            | Description                                      |
|-------------------|--------------------------------------------------|
| `X-Signature`     | HMAC-SHA256 hex digest of the raw request body   |
| `X-Key-Id`        | Identifier selecting which secret to verify with |

**Response `202`**

```json
{ "status": "accepted" }
```

**Response `400`** — request body could not be read

```json
{ "error": "Failed to read request body" }
```

**Response `401`** — `X-Signature` header absent

```json
{ "error": "Missing signature header" }
```

**Response `401`** — `X-Key-Id` header absent

```json
{ "error": "Missing key-id header" }
```

**Response `401`** — `X-Key-Id` value does not match any registered secret

```json
{ "error": "Unknown key-id" }
```

**Response `401`** — signature does not match the computed HMAC

```json
{ "error": "Invalid signature" }
```

---

## Rate Limiting

The API enforces configurable rate limits to protect against abuse. Limits can be set globally or per-client using API keys or IP addresses.

### Rate Limit Headers

All responses include these headers when rate limiting is enabled:

| Header                  | Description                                              |
|-------------------------|----------------------------------------------------------|
| `X-RateLimit-Limit`     | Maximum requests allowed in the current window           |
| `X-RateLimit-Remaining` | Requests remaining before hitting the limit              |
| `X-RateLimit-Reset`     | Unix timestamp (seconds) when the window resets          |

When a rate limit is exceeded:

| Header        | Description                                     |
|---------------|-------------------------------------------------|
| `Retry-After` | Seconds to wait before retrying the request     |

### GET /api/rate-limit/metrics

Returns real-time rate limiting statistics for monitoring and analysis.

**Query Parameters**

| Name  | Type    | Required | Description                                      |
|-------|---------|----------|--------------------------------------------------|
| reset | boolean | No       | If `true`, resets metrics after reading them     |

**Response `200`**

```json
{
  "totalRequests": 1543,
  "blockedRequests": 87,
  "allowedRequests": 1456,
  "uniqueClients": 23,
  "topBlockedClients": [
    {
      "clientId": "192.168.1.100",
      "blockCount": 45
    },
    {
      "clientId": "sk_live_...",
      "blockCount": 23
    }
  ],
  "startTime": "2024-01-01T12:00:00.000Z"
}
```

| Field              | Type   | Description                                                  |
|--------------------|--------|--------------------------------------------------------------|
| totalRequests      | number | Total requests processed since server start or last reset    |
| blockedRequests    | number | Requests that were rate limited                              |
| allowedRequests    | number | Requests that were allowed through                           |
| uniqueClients      | number | Number of distinct clients currently tracked                 |
| topBlockedClients  | array  | Top 10 clients by block count (API keys are masked)          |
| startTime          | string | ISO 8601 timestamp when metrics tracking started             |

**Response `503`** — rate limiting is disabled

```json
{ "error": "Rate limiting not enabled" }
```

**Example — fetch metrics**

```http
GET /api/rate-limit/metrics HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "totalRequests": 1543,
  "blockedRequests": 87,
  "allowedRequests": 1456,
  "uniqueClients": 23,
  "topBlockedClients": [
    { "clientId": "192.168.1.100", "blockCount": 45 }
  ],
  "startTime": "2024-01-01T12:00:00.000Z"
}
```

**Example — fetch and reset metrics**

```http
GET /api/rate-limit/metrics?reset=true HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "totalRequests": 1543,
  "blockedRequests": 87,
  "allowedRequests": 1456,
  "uniqueClients": 23,
  "topBlockedClients": [],
  "startTime": "2024-01-01T12:00:00.000Z"
}
```

---

## Health

### GET /health

Returns the operational status of all service dependencies.

**Response `200`** — all systems operational or non-critical services degraded

```json
{
  "status": "ok",
  "timestamp": "2024-06-20T14:00:00.000Z",
  "services": {
    "stellarRpc": { "status": "ok", "latencyMs": 42 },
    "discord": { "status": "ok", "latencyMs": 87 },
    "eventRegistry": { "status": "ok", "eventCount": 128 }
  }
}
```

`status` is `"degraded"` when Discord is unreachable but Stellar RPC is healthy:

```json
{
  "status": "degraded",
  "timestamp": "2024-06-20T14:00:00.000Z",
  "services": {
    "stellarRpc": { "status": "ok", "latencyMs": 38 },
    "discord": { "status": "error", "latencyMs": 5001, "detail": "HTTP 401" },
    "eventRegistry": { "status": "ok", "eventCount": 128 }
  }
}
```

**Response `503`** — Stellar RPC is unreachable

```json
{
  "status": "error",
  "timestamp": "2024-06-20T14:00:00.000Z",
  "services": {
    "stellarRpc": { "status": "error", "latencyMs": 5001, "detail": "Health check timed out" },
    "discord": { "status": "ok", "latencyMs": 65 },
    "eventRegistry": { "status": "ok", "eventCount": 128 }
  }
}
```

**Response `500`** — health check itself threw an unexpected error

```json
{ "status": "error", "detail": "Internal health check failure" }
```

A service entry's `status` field can be `"ok"`, `"error"`, or `"not_configured"`. `"not_configured"` means the service URL was not provided at startup and is not checked.

---

## Error Codes Reference

Every error response is a JSON object. All errors carry an `error` string. Rate-limit responses also include a `message` field; health-check failures use `detail` instead.

```json
{ "error": "Human-readable description of what went wrong" }
```

Every response — success or error — includes the following tracing headers:

| Header            | Description                                    |
|-------------------|------------------------------------------------|
| `X-Request-Id`    | Unique ID generated for this request           |
| `X-Correlation-Id`| Caller-supplied or server-generated trace ID   |

---

### Status Code Table

| HTTP Code | Name                  | When it occurs                                                    | Client action                                                            |
|-----------|-----------------------|-------------------------------------------------------------------|--------------------------------------------------------------------------|
| 200       | OK                    | Request succeeded; body contains the result                       | Consume response body                                                    |
| 201       | Created               | Resource created (scheduled notification)                         | Persist the returned `id` for future lookups                             |
| 202       | Accepted              | Webhook accepted for processing                                   | No further action needed                                                 |
| 204       | No Content            | CORS preflight (`OPTIONS`) succeeded                              | Browser handles automatically                                            |
| 400       | Bad Request           | Client sent invalid input — see error message for the specific field | Fix the request body or parameters before retrying                    |
| 401       | Unauthorized          | Webhook signature is missing, unrecognised, or invalid            | Verify the signing secret and key ID; regenerate the HMAC               |
| 404       | Not Found             | Route or resource does not exist                                  | Check the URL and resource ID                                            |
| 429       | Too Many Requests     | Client exceeded its rate limit for the current window             | Wait `Retry-After` seconds before sending the next request              |
| 500       | Internal Server Error | Unhandled server-side failure                                     | Retry with exponential backoff; report if persistent                     |
| 503       | Service Unavailable   | Scheduler is disabled, or Stellar RPC is unreachable             | Check server configuration or wait for dependency to recover             |

---

### 400 Bad Request

The request was rejected because client-supplied data failed validation.

| Error message | Endpoint | Cause | Fix |
|---|---|---|---|
| `"Invalid body: expected { categories: { [key]: boolean } }"` | `PUT /api/preferences/:userId` | Body is valid JSON but `categories` field is absent or not an object | Send `{ "categories": { "discord": true } }` |
| `"Invalid JSON"` | `PUT /api/preferences/:userId` | Body is not parseable JSON | Ensure `Content-Type: application/json` and well-formed JSON |
| `"Missing required fields: executeAt, payload, targetRecipient"` | `POST /api/schedule` | One or more of the three required fields is absent | Include all three fields in the request body |
| `"executeAt is not a valid date"` | `POST /api/schedule` | `executeAt` string cannot be parsed as a JavaScript `Date` | Use a valid ISO 8601 string, e.g. `"2024-06-20T15:00:00.000Z"` |
| `"Invalid notification ID"` | `GET /api/schedule/:id` | `:id` path segment is not a valid integer | Use a numeric ID returned by `POST /api/schedule` |
| `"Failed to read request body"` | `POST /api/webhooks` | The connection was dropped while reading the body | Resend the request with the full body intact |

**Example — missing schedule fields**

```http
POST /api/schedule HTTP/1.1
Content-Type: application/json

{ "payload": { "content": "hello" } }
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
X-Request-Id: f3a2c1b0-...

{ "error": "Missing required fields: executeAt, payload, targetRecipient" }
```

---

### 401 Unauthorized

All `401` errors come from the `POST /api/webhooks` endpoint when signature verification fails. The request must carry both `X-Signature` and `X-Key-Id` headers.

| Error message | Cause | Fix |
|---|---|---|
| `"Missing signature header"` | `X-Signature` header is absent | Add the header with an HMAC-SHA256 hex digest of the raw request body |
| `"Missing key-id header"` | `X-Key-Id` header is absent | Add the header with the ID of the signing key used |
| `"Unknown key-id"` | The `X-Key-Id` value does not match any key registered with the server | Use a key ID that the server was started with |
| `"Invalid signature"` | The signature does not match the server's HMAC computation | Re-sign the raw body bytes with the correct secret; ensure no encoding transformation is applied to the body in transit |

**Example — wrong secret**

```http
POST /api/webhooks HTTP/1.1
X-Signature: aabbccdd...
X-Key-Id: key-prod-1
Content-Type: application/json

{ "event": "TaskCreated", "contractAddress": "CCEMX6..." }
```

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
X-Request-Id: d9e1f2a3-...

{ "error": "Invalid signature" }
```

---

### 404 Not Found

| Error message | When | Fix |
|---|---|---|
| `"Not found"` | The request path does not match any known route | Check the URL against this document |
| `"Notification not found"` | `GET /api/schedule/:id` — no notification exists with the given ID | Verify the ID was returned by `POST /api/schedule` and has not been purged |

---

### 429 Too Many Requests

Returned by the rate limiter when a client exceeds the configured request quota within the sliding window.

The response always includes `error` and `message`. Response headers tell the client exactly when to retry.

**Response headers**

| Header              | Description                                                    |
|---------------------|----------------------------------------------------------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window                 |
| `X-RateLimit-Remaining` | Requests still available (0 when limited)                  |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the oldest slot leaves the window |
| `Retry-After`       | Seconds to wait before the next request will be accepted       |

**Client identification** — the limiter tracks clients by API key first, then by IP address:

1. `X-API-Key` header value
2. `Authorization: Bearer <token>` token
3. `X-Forwarded-For` first IP
4. TCP remote address

**Example**

```http
GET /api/events HTTP/1.1
X-API-Key: my-key

```

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1718640060
Retry-After: 12
X-Request-Id: 8b4c3d2e-...

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 12 seconds."
}
```

Rate limit violations are recorded in the SQLite database for audit purposes.

---

### 500 Internal Server Error

Returned when the server encounters an unexpected failure. The `error` field contains the original exception message.

| Endpoint | Likely cause |
|---|---|
| `POST /api/schedule` | Database write failure; SQLite locked or corrupt |
| `GET /api/schedule/:id` | Database read failure |
| `GET /api/schedule/stats` | Database read failure |
| `GET /health` | Unexpected exception in the health check loop |

**Example**

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json
X-Request-Id: 1c2d3e4f-...

{ "error": "SQLITE_BUSY: database is locked" }
```

Retry with exponential backoff. If the error persists, inspect the server logs using the `X-Request-Id` from the response to find the full stack trace.

The `/health` endpoint returns a distinct shape on its own internal failure:

```json
{ "status": "error", "detail": "Internal health check failure" }
```

---

### 503 Service Unavailable

Returned in two distinct situations.

**Scheduler disabled**

`POST /api/schedule`, `GET /api/schedule/:id`, and `GET /api/schedule/stats` all return `503` when the scheduler was not enabled at startup (i.e. the `notificationAPI` option was not provided).

```json
{ "error": "Scheduler not enabled" }
```

This is a configuration issue, not a transient failure. Retrying will not help until the service is restarted with the scheduler enabled.

**Stellar RPC unreachable**

`GET /health` returns `503` when the Stellar RPC node cannot be reached or times out (5-second timeout). The body is the full health object with `"status": "error"`:

```json
{
  "status": "error",
  "timestamp": "2024-06-20T14:00:00.000Z",
  "services": {
    "stellarRpc": {
      "status": "error",
      "latencyMs": 5001,
      "detail": "Health check timed out"
    },
    "discord": { "status": "ok", "latencyMs": 54 },
    "eventRegistry": { "status": "ok", "eventCount": 200 }
  }
}
```

Wait for the upstream Stellar RPC node to recover, or point `STELLAR_RPC_URL` at a healthy node and restart the service.

---

### Diagnosing errors with request IDs

Every response carries `X-Request-Id` (a UUID unique to that request) and `X-Correlation-Id` (a caller-supplied or server-generated trace ID). Include both values when reporting issues.

Server-side logs are keyed on the same IDs:

```
[WARN]  requestId=8b4c3d2e correlationId=front-42 Webhook missing signature header
[ERROR] requestId=1c2d3e4f correlationId=front-43 Failed to schedule notification { error: "SQLITE_BUSY" }
```

To propagate a trace ID from your own service, send `X-Correlation-Id` in the request. The server echoes it back in the response header.
