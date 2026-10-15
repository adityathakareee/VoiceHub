# CSE Voice Hub — Health Check API Specification

> **Endpoint**: `GET /api/health`

---

## 1. Overview
The `/api/health` endpoint provides real-time operational status of the Express API backend, system uptime, and MongoDB connectivity.

---

## 2. HTTP Request Format
* **Method**: `GET`
* **Path**: `/api/health`
* **Headers**:
  * `Accept: application/json`

---

## 3. Response Schema

### 3.1 Healthy State (MongoDB Connected)
**HTTP Status**: `200 OK`

```json
{
  "success": true,
  "service": "CSE Voice Hub API",
  "status": "healthy",
  "timestamp": "2026-09-23T00:20:10.000Z",
  "uptime": 128.45,
  "database": {
    "status": "connected"
  }
}
```

### 3.2 Degraded State (MongoDB Offline / Disconnected)
**HTTP Status**: `200 OK`

```json
{
  "success": true,
  "service": "CSE Voice Hub API",
  "status": "degraded",
  "timestamp": "2026-09-23T00:20:10.000Z",
  "uptime": 45.12,
  "database": {
    "status": "disconnected"
  }
}
```

---

## 4. Field Descriptions

| Field | Type | Description |
| :--- | :--- | :--- |
| `success` | `boolean` | Always `true` for a functioning HTTP response. |
| `service` | `string` | Human-readable service identifier (`"CSE Voice Hub API"`). |
| `status` | `string` | `"healthy"` if database is connected; `"degraded"` if database is offline. |
| `timestamp` | `string` | Current UTC server timestamp in ISO 8601 format. |
| `uptime` | `number` | Server process uptime duration in seconds. |
| `database.status` | `string` | Mongoose connection state: `"connected"`, `"disconnected"`, or `"connecting"`. |
