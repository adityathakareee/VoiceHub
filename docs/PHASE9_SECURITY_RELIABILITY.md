# Phase 9 — Security & Reliability Architecture Specification

## Architectural Overview & Phase 9 Scope

Phase 9 hardens the **CSE Voice Hub** system against failures, malformed input, network interruptions, duplicate sessions, stale resources, audio device failures, and abrupt server shutdowns while preserving 100% compatibility with Phases 1 through 8.

```
+-----------------------------------------------------------------------------------------+
|                                    CONTROL PLANE                                        |
|  Browser / Client  ----[ HTTPS / WSS ]---->  Express API  ---->  MongoDB (Sessions/Rooms)  |
|         |                                      |                                        |
|         | JWT Authentication                   | Room Membership & RBAC Enforcement     |
|         | Zod Input Validation                 | Bounded Control WS Reconnection        |
+---------|--------------------------------------|----------------------------------------+
          |                                      |
          v                                      v
+-----------------------------------------------------------------------------------------+
|                                     MEDIA PLANE                                         |
|  Browser Web Audio  <--[ WS:5002 ]-->  Companion Bridge  <--[ UDP:5001 ]-->  UDP Media  |
|  - Recoverable UI                      - Graceful Close                       - MTU 1200 |
|  - Dynamic Playout                     - Compact FEC                          - Registry |
|  - Exponential Backoff                 - Safe Decodes                         - Router   |
+-----------------------------------------------------------------------------------------+
```

---

## 1. Authentication & Session Security

1. **REST Authentication**:
   - Every protected room and adaptive endpoint requires a valid JWT extracted via HttpOnly cookie or `Authorization: Bearer <token>`.
   - Token signature, expiration (`exp`), and active user status are verified server-side.
   - If a user changes their password, all previous tokens issued prior to `user.passwordChangedAt` are rejected with HTTP 401 Unauthorized.
   - Missing or tampered tokens result in clean HTTP 401 Unauthorized responses without exposing internal stack traces.

2. **WebSocket Control Authentication (`/ws/control`)**:
   - Connection upgrade requests authenticate the user via cookie or query parameter token.
   - Server strictly verifies:
     - JWT signature and expiration.
     - User existence and active status.
     - Room existence and non-closed status (`room.status !== CLOSED`).
     - Active room membership (`RoomMember.status === ACTIVE`).
   - Unauthenticated or non-member upgrade attempts are rejected immediately with HTTP 401 / socket destruction before completing the handshake.

3. **UDP Session Authorization**:
   - UDP registration requires a cryptographically signed HMAC token (`signUdpSessionToken`) containing `userId`, `roomCode`, and `role`.
   - The token expires within 5 minutes.
   - Token `roomCode` must match the requested `roomCode`.
   - Tampered tokens, expired tokens, or forged signatures return structured `ERROR` datagrams.

---

## 2. Server-Side Authorization & Role Enforcement

Authorization is strictly enforced server-side. Client-supplied roles, IDs, or permissions are never trusted:

| Role / Context | Permitted Capabilities | Prohibited Actions | Server-Side Enforcement |
| :--- | :--- | :--- | :--- |
| **STUDENT / MEMBER** | Join room, receive/send audio, toggle local mute/speaking, query metrics & adaptive state | Edit room metadata, close room, alter room adaptive policy | HTTP 403 Forbidden on update/close endpoints |
| **ROOM OWNER** | Manage room metadata, close room, update room adaptive policy (`/adaptive-config`) | Cannot access or modify other rooms | Verified via `room.isOwner` in service layer |
| **ADMINISTRATOR** | Full administrative oversight across rooms | Cannot bypass core cryptographic validation | Verified via `user.role === 'ADMIN'` |
| **NON-MEMBER** | Cannot access room state, receive/send media, or see participant list | All room member operations | HTTP 403 Forbidden |

---

## 3. UDP Session Security & Anti-Spoofing

1. **Session Identifiers**:
   - Unique, cryptographically random session IDs (`udp_sess_<24-hex-chars>`).
   - Must conform to safe alphanumeric/underscore regex (`/^[a-zA-Z0-9_\-]+$/`).
2. **Endpoint Mismatch & Hijacking Protection**:
   - Each registered session is bound to its remote IP address and UDP port (`address:port`).
   - Incoming `DATA`, `RATE_CONTROL`, and `HEARTBEAT` packets are verified against the registered endpoint.
   - If a packet contains a valid `sessionId` but originates from a different IP or port, the server rejects it with `INVALID_ENDPOINT: Packet origin does not match registered session endpoint`.
   - This prevents cross-client packet injection and session hijacking.
3. **Server-Side Room Identity Derivation**:
   - In `RoomRouter`, forwarded packets are stamped with `senderSession.sessionId`, `senderSession.clientId`, and `senderSession.roomCode`.
   - Clients cannot forge their identity or inject audio into other rooms.

---

## 4. Defensive Malformed Packet Validation

The UDP server employs a two-tier defensive validation pipeline before packet processing:

### A. Low-Level Parser Protection (`PacketParser.parse`)
- **Empty Datagrams**: Buffers of length 0 are rejected immediately (`'Empty datagram payload'`).
- **Oversized Datagrams**: Buffers exceeding `UDP_MAX_PACKET_SIZE` (1200 bytes) are rejected prior to any memory allocation or JSON parsing.
- **Malformed JSON**: JSON syntax errors are safely caught, preventing uncaught exceptions.
- **Type Guard**: Non-object or array JSON representations (`[]`) are rejected.

### B. Protocol Semantic Validation (`PacketValidator.validate`)
- **Version**: Strictly enforced to `1`.
- **Packet Type**: Must be a recognized `UdpPacketType`.
- **Timestamp**: Must be a positive, finite unix timestamp (`timestamp > 0`).
- **Identifier Length & Characters**: `sessionId`, `clientId`, `roomCode` bounded and checked against safe regexes.
- **DATA Payload**:
  - `sequence`: Non-negative integer (`Number.isInteger(sequence) && sequence >= 0`).
  - `pcm`: Valid Base64 format, maximum 4096 characters, non-empty.
  - `frameDurationMs`: Valid range between 5ms and 200ms.
  - `sampleRate`: Valid supported rates (8000, 16000, 24000, 48000 Hz).
  - `channels`: 1 or 2.
  - FEC Redundancy: `redundantSeq` non-negative integer, `redundantPcm` valid Base64, factors $\le 16$.
- **RATE_CONTROL**:
  - Validates profile string (`ULTRA`, `HIGH`, `STANDARD`, `CONSTRAINED`, `CRITICAL`).
  - Validates mode (`AUTO`, `MANUAL`).

---

## 5. Duplicate Session & Reconnect Strategy

When a user or client endpoint reconnects:
1. **Deterministic Replacement Policy**:
   - `UdpClientRegistry.registerSession` scans for existing sessions matching the same `(userId, roomCode)` or the same IP/Port endpoint.
   - If an existing session is found, it is **cleanly invalidated and removed** before creating the new session.
   - The user is issued a fresh, unique session ID.
2. **Inactive Old Session**:
   - Any packets sent using the prior session ID are rejected with `INVALID_SESSION`.
   - Prevents duplicate audio routing, ghost participants, or state confusion.

---

## 6. Stale Session Purging & Heartbeat Lifecycle

1. **Heartbeat Manager (`HeartbeatManager`)**:
   - UDP clients send periodic `HEARTBEAT` packets every 5000ms.
   - `HeartbeatManager` runs every 5000ms and scans active sessions.
   - If `Date.now() - session.lastSeen > 15000ms` (15s inactivity timeout), the session is marked stale and purged from the registry.
2. **WebSocket Control Heartbeat**:
   - `controlWsService` checks active client sockets every 30s.
   - Stale or inactive connections ($>90$s silence) are terminated cleanly.

---

## 7. WebSocket Reconnection with Bounded Exponential Backoff

The frontend `RoomPresenceClient` implements bounded exponential backoff to handle network interruptions without aggressive retry storms:
- **Initial Delay**: $1000\text{ ms}$.
- **Backoff Multiplier**: $1.5\times$ per attempt.
- **Upper Bound**: Clamped at $10{,}000\text{ ms}$ (10s maximum).
- **Reset**: Delay and attempt counters reset to 0 upon successful connection (`onopen`).
- **Explicit Disconnect**: On room leave or user logout, reconnection timers are cancelled immediately.

---

## 8. Audio Failure Handling & Recovery

1. **Frontend Web Audio Lifecycle**:
   - If microphone permission is denied or hardware is unavailable, `useRealtimeAudio.ts` sets `micPermission: 'denied'` and enters a clean error state without crashing the UI.
   - If `AudioContext` creation or resume fails, error state is displayed with a user-recoverable retry button.
   - `stopAudio()` tears down all `ScriptProcessorNode`, `MediaStreamTrack`, master gain, and remote participant nodes cleanly.
2. **Companion Bridge Disconnect**:
   - If the WebSocket bridge disconnects mid-call, audio session state transitions to `DISCONNECTED` or `ERROR`.
   - The user can reconnect by clicking "Start Audio" without refreshing the browser page.

---

## 9. Graceful Process Shutdown

All three application layers handle `SIGINT` and `SIGTERM` signals for clean shutdown:
1. **Backend API (`backend/src/server.ts`)**:
   - Closes WebSocket control server (`controlWsService.close()`).
   - Closes HTTP server.
   - Disconnects MongoDB connection (`dbService.disconnect()`).
   - Exits process with code 0.
2. **UDP Server (`udp-server/src/server.ts`)**:
   - Stops heartbeat check interval.
   - Clears active session registry.
   - Closes UDP socket (`udpService.close()`).
   - Exits process with code 0.
3. **Companion Bridge (`udp-server/src/bridge/local-bridge.ts`)**:
   - Closes client WebSockets.
   - Closes HTTP bridge server.
   - Exits process with code 0.

---

## 10. Rate Limiting & Abuse Protection

1. **Control Plane REST**:
   - `authRateLimiter` limits authentication requests to 30 requests per 15-minute window in production.
2. **UDP Datagram Flood Protection**:
   - In-memory rate limiter per IP address inside `UdpSocketService`.
   - Enforces 1500 packets/sec maximum per IP.
   - Limits malformed/invalid packets to 60 packets/sec before dropping abusive traffic silently to prevent CPU exhaustion.
3. **Input Length Limits**:
   - Token strings $\le 1024$ bytes.
   - Datagram size $\le 1200$ bytes MTU limit.
   - Base64 PCM payload $\le 4096$ characters.

---

## 11. Known Limitations

1. **Single-Host Monorepo Deployment**:
   - Companion Bridge and UDP server run locally on ports 5002 and 5001. In a multi-server production environment, a distributed session store (e.g. Redis) would be used for multi-node state synchronization.
2. **Browser Simulated Audio**:
   - Microphone capture was validated via synthetic Web Audio nodes and headless pipelines. Physical hardware testing with live microphones depends on client hardware availability.
