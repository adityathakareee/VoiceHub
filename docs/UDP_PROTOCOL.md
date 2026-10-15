# CSE VOICE HUB — DEFINITIVE UDP PROTOCOL SPECIFICATION

## Protocol Specification: Version 1.0

The CSE Voice Hub Data Plane operates over UDP using a lightweight, versioned, JSON-serialized datagram protocol strictly bounded by an MTU limit of **1200 bytes**.

---

## 1. Packet Wire Structure

### `UdpPacket` Schema
```typescript
interface UdpPacket {
  version: number;               // Protocol version (Always 1)
  type: UdpPacketType;           // Enumerated packet type
  sessionId?: string;            // Server-assigned session ID (e.g., "udp_sess_12345")
  clientId?: string;             // User/client identifier
  roomCode?: string;             // Alphanumeric room code (e.g., "CVH-7K4P2M")
  token?: string;                // HMAC-signed UDP session token (REGISTER only)
  sequence?: number;             // Monotonically increasing 32-bit sequence integer
  timestamp: number;             // Sender unix timestamp in milliseconds
  payload?: any;                 // Media, telemetry, or rate control payload
  error?: string;                // Error description in ERROR packets
}
```

### Protocol Enumerations (`UdpPacketType`)
- `REGISTER`: Session handshake and authentication
- `REGISTER_ACK`: Registration confirmation with session assignment
- `DATA`: Audio media frame transmission
- `PING`: Diagnostic round-trip latency probe
- `PONG`: Diagnostic probe echo response
- `HEARTBEAT`: Periodic liveness probe (5000 ms cadence)
- `HEARTBEAT_ACK`: Liveness confirmation
- `LEAVE`: Graceful session termination
- `ERROR`: Protocol or authorization error notification
- `METRICS`: Real-time network telemetry request and response
- `RATE_CONTROL`: Dynamic transmission profile signaling

---

## 2. Packet Types & Handshake Specifications

### 1. `REGISTER` & `REGISTER_ACK`
- **Sender:** Client / Companion Bridge $\to$ UDP Media Server
- **Purpose:** Initiates UDP communication by presenting an HMAC-signed token minted by the Control Plane.
- **Fields:**
  ```json
  {
    "version": 1,
    "type": "REGISTER",
    "clientId": "usr_789",
    "roomCode": "CVH-AUD100",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "timestamp": 1727100000000
  }
  ```
- **Validation:**
  1. Verifies token HMAC signature against `UDP_SESSION_SECRET`.
  2. Confirms token expiration ($< 300\text{ seconds}$).
  3. Binds remote IP address and UDP port to the generated `sessionId`.
- **Response (`REGISTER_ACK`):**
  ```json
  {
    "version": 1,
    "type": "REGISTER_ACK",
    "sessionId": "udp_sess_a1b2c3d4e5f6",
    "clientId": "usr_789",
    "roomCode": "CVH-AUD100",
    "timestamp": 1727100000005
  }
  ```

---

### 2. `DATA` (Audio Media Transport)
- **Sender:** Companion Bridge $\to$ UDP Media Server $\to$ Peer Companion Bridges
- **Purpose:** Carries framed audio data with optional RFC 2198-inspired redundant payload.
- **Fields:**
  ```json
  {
    "version": 1,
    "type": "DATA",
    "sessionId": "udp_sess_a1b2c3d4e5f6",
    "sequence": 1042,
    "timestamp": 1727100000020,
    "payload": {
      "format": "pcm8",
      "mediaType": "audio/pcm8",
      "sampleRate": 16000,
      "channels": 1,
      "frameDurationMs": 20,
      "pcm": "UklGRi4AAABXQVZF...",
      "redundantSeq": 1041,
      "redundantPcm": "AAD//wAA//8AAP//...",
      "redundantFactor": 5
    }
  }
  ```
- **Routing Rules:**
  - **Room Isolation:** Broadcasts only to other active sessions registered under the same `roomCode`.
  - **Sender Non-Echo:** Packet is never forwarded back to the sender socket.
  - **Endpoint Guard:** Sockets with mismatched IP or port are rejected (`INVALID_ENDPOINT`).

---

### 3. `PING` & `PONG`
- **Sender:** Client $\to$ Server $\to$ Client
- **Purpose:** Measures active network round-trip time (RTT).
- **Format:**
  ```json
  { "version": 1, "type": "PING", "sessionId": "udp_sess_a1b2c3d4e5f6", "sequence": 1, "timestamp": 1727100000000 }
  ```
- **Response:**
  ```json
  { "version": 1, "type": "PONG", "sessionId": "udp_sess_a1b2c3d4e5f6", "sequence": 1, "timestamp": 1727100000000 }
  ```

---

### 4. `HEARTBEAT` & `HEARTBEAT_ACK`
- **Sender:** Companion Bridge $\to$ UDP Media Server
- **Cadence:** Dispatched every 5000 ms.
- **Timeout:** Sessions inactive for $> 15,000\text{ ms}$ are purged by the `HeartbeatManager`.

---

### 5. `RATE_CONTROL`
- **Sender:** Companion Bridge $\leftrightarrow$ UDP Media Server
- **Purpose:** Signals active transmission profile, pacing bitrate, and frame interval.
- **Fields:**
  ```json
  {
    "version": 1,
    "type": "RATE_CONTROL",
    "sessionId": "udp_sess_a1b2c3d4e5f6",
    "timestamp": 1727100000030,
    "payload": {
      "mode": "AUTO",
      "profile": "CONSTRAINED",
      "targetBitrateKbps": 32,
      "frameIntervalMs": 25,
      "fecActive": true,
      "targetPlayoutDelayMs": 111,
      "reason": "Congestion Throttling: Network degraded (Loss: 4.2%, RTT: 160ms)"
    }
  }
  ```

---

### 6. `LEAVE`
- **Sender:** Client $\to$ UDP Media Server
- **Purpose:** Explicitly unregisters the UDP session and triggers immediate session cleanup.

---

### 7. `ERROR`
- **Sender:** UDP Media Server $\to$ Client
- **Error Codes:**
  - `INVALID_SESSION`: Unknown or expired session identifier.
  - `INVALID_ENDPOINT`: Remote IP or port does not match registered session binding (anti-spoofing).
  - `OVERSIZED_PACKET`: Datagram length exceeds 1200 bytes.
  - `MALFORMED_PACKET`: JSON parse failure or invalid schema.
  - `UNAUTHORIZED`: Invalid or expired HMAC authentication token.

---

## 3. MTU Boundary Enforcement
To prevent IP-layer packet fragmentation over standard Ethernet and WAN connections (where path MTU is typically 1400–1500 bytes), the UDP server strictly drops any wire datagram exceeding **1200 bytes**:

```typescript
if (msg.length > envConfig.UDP_MAX_PACKET_SIZE) { // 1200 bytes
  logger.warn(`[UDP] Packet size (${msg.length} bytes) exceeds maximum allowed size (1200 bytes)`);
  return; // Dropped safely before JSON parsing
}
```
