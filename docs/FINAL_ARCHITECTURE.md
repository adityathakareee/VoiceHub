# CSE VOICE HUB — FINAL SYSTEM ARCHITECTURE

## 1. System Overview
The **CSE Voice Hub** is a modular, high-performance real-time audio conferencing and rate-adaptive media delivery system designed for educational and research environments. It features a strict architectural separation between a stateful, reliable **Control Plane** (HTTP/REST, MongoDB, WebSocket presence sync) and a low-latency, connectionless **Data Plane** (UDP media server, HMAC session tokens, room-isolated packet routing, dynamic rate adaptation, and application-level forward error correction).

---

## 2. High-Level System Architecture Diagram

```
+--------------------------------------------------------------------------------------------------+
|                                        CLIENT BROWSER LAYER                                      |
|                                                                                                  |
|   +-----------------------+     +------------------------+     +-----------------------------+   |
|   |   React 18 SPA (UI)   |     | Web Audio Capture Node |     | Web Audio Playback & Jitter |   |
|   |  - Telemetry HUD      |     | - 16 kHz Mono PCM16    |     | - Multi-Stream Gain Graph   |   |
|   |  - Adaptive HUD       |     | - Dynamic Framing      |     | - RFC 3550 Playout Buffer   |   |
|   |  - Presence Controls  |     | - Mute Suppression    |     | - Headroom (1/sqrt(N))      |   |
|   +-----------+-----------+     +-----------+------------+     +--------------^--------------+   |
+---------------|-----------------------------|---------------------------------|------------------+
                |                             |                                 |
        REST &  |                     Raw PCM |                         Decoded |
     WebSocket  |                   WebSocket |                             PCM |
                |                             |                                 |
+---------------v-----------------------------v---------------------------------+------------------+
|      CONTROL PLANE (PORT 5000)      |        LOCAL AUDIO COMPANION BRIDGE (PORT 5002)            |
|                                     |                                                            |
|  - JWT Authentication (HttpOnly)    |  - WebSocket Endpoint (ws://127.0.0.1:5002)                |
|  - Role Access Control (RBAC)       |  - PCM16/PCM8 Companding & Decimation Codec                |
|  - Conference Room Management       |  - RFC 2198-Inspired Redundancy / FEC Generator            |
|  - WebSocket State Sync (/ws/control)|  - UDP Framing (1200-Byte MTU Clamp)                       |
|  - UDP Session Token Minting (HMAC) |  - Dynamic Frame Sizing (15ms - 40ms)                      |
|  - REST Room Telemetry & Policy API |  - Rate Control Signaling & Telemetry Relayer              |
|                                     +-----------------------------+------------------------------+
+---------------+---------------------+                             |
                |                                                   | Bidirectional UDP
                | Mongoose ORM                                      | Datagrams (dgram)
                v                                                   v
+---------------+---------------------+     +-----------------------+------------------------------+
|       MONGODB DATABASE ENGINE       |     |          UDP MEDIA SERVER (PORT 5001)                |
|                                     |     |                                                      |
|  - users (bcrypt credentials, role) |     |  - UDP Socket Service (Node.js dgram)                |
|  - rooms (code, owner, max capacity)|     |  - PacketParser & PacketValidator (Security Barrier) |
|  - roommembers (active state index) |     |  - UdpClientRegistry (Endpoint Binding & HMAC Token) |
|                                     |     |  - RoomRouter (Room Isolation & Non-Echo Multicast)  |
|                                     |     |  - HeartbeatManager (15s Session Timeout)            |
|                                     |     |  - NetworkMetricsCollector (RFC 3550 Jitter / Loss)  |
|                                     |     |  - AdaptiveRateController (AIMD / Profile State)     |
+-------------------------------------+     +------------------------------------------------------+
```

---

## 3. Control Plane vs. Data Plane Separation

### Why the Separation Exists
In real-time audio systems, mixing media packets with transactional signaling leads to head-of-line blocking, latency spikes, and severe jitter. The CSE Voice Hub enforces physical and protocol separation:

| Dimension | Control Plane | Data Plane |
| :--- | :--- | :--- |
| **Transport Protocol** | TCP (HTTP/1.1 REST & WebSocket) | UDP (`node:dgram` sockets) |
| **Primary Host/Port** | `localhost:5000` | `127.0.0.1:5001` (Media), `5002` (Bridge) |
| **Delivery Semantics** | Reliable, in-order, guaranteed | Unreliable, unordered, real-time |
| **State Persistence** | Persistent in MongoDB (Users, Rooms) | Transient in-memory state (Sessions, Sockets) |
| **Security Layer** | JWT in signed HttpOnly cookies | HMAC-SHA256 UDP Session Tokens + IP Binding |
| **Primary Tasks** | Auth, Room lifecycle, presence sync, policy | Audio transport, packet routing, FEC, telemetry |
| **Tolerable Latency** | 100 ms – 500 ms | $< 20\text{ ms}$ (Ultra-low latency budget) |

### Boundary Interaction
1. **Control to Data Plane Handshake:**
   - A user joins a conference room via the Control Plane (`POST /api/rooms/:roomCode/join`).
   - The user requests a UDP session token (`POST /api/rooms/:roomCode/udp-token`).
   - The Control Plane mints an HMAC-SHA256 signed token containing `userId`, `roomCode`, and an expiration timestamp (300 seconds).
   - The client supplies this token to the UDP Media Server via a `REGISTER` datagram.
   - The UDP Server validates cryptographic authenticity, binds the client's source IP and UDP port to the session in `UdpClientRegistry`, and responds with `REGISTER_ACK`.
2. **State Synchronization:**
   - When a user changes their mute status, the change is broadcast over the Control Plane WebSocket (`/ws/control`).
   - In addition, the Companion Bridge locally suppresses audio datagram transmission during mute, completely eliminating uplink bandwidth consumption.

---

## 4. Complete Audio Pipeline Architecture

### End-to-End Audio Signal Path
```
[Microphone In (Analog)]
        │
        ▼
[Web Audio API (Browser)]
  ├─ AudioContext (16,000 Hz Mono)
  ├─ ScriptProcessorNode / AudioWorklet Buffer Extraction
  └─ Float32 Array [-1.0, 1.0]
        │
        ▼
[Audio Conversion (Browser)]
  └─ Float32 to 16-bit Signed Little-Endian Integer (PCM16)
        │
        ▼  WebSocket Local Dispatch (ws://127.0.0.1:5002)
[Companion Bridge Processing]
  ├─ Dynamic Frame Buffer Sizing (based on active profile)
  ├─ Loss Mitigation Check:
  │    ├─ If FEC Active: Compand PCM16 to 8-bit non-linear PCM8 (and decimate if frame > 400s)
  │    └─ Encode previous frame into redundant payload
  └─ Serialize into versioned UdpPacket (JSON Base64) strictly <= 1200 Bytes
        │
        ▼  UDP Datagram Transmission (dgram socket)
[UDP Media Server (127.0.0.1:5001)]
  ├─ MTU Guard (drops any datagram > 1200 bytes)
  ├─ Endpoint & Session ID Verification (Anti-Spoofing)
  ├─ Telemetry Ingestion (RFC 3550 Jitter, Loss %, RTT update)
  ├─ RoomRouter Multicast Fanout:
  │    ├─ Room Isolation: Packet dispatched ONLY to sockets in matching room
  │    └─ Sender Non-Echo: Packet strictly NOT forwarded back to sender session
  └─ Dispatch UDP Datagrams to Peer Companion Bridges
        │
        ▼  UDP Datagram Arrival (Peer Bridge)
[Receiver Companion Bridge]
  ├─ Sequence Gap Analysis:
  │    └─ If Sequence Gap Detected & Redundant Payload Present:
  │         └─ Decode & Reconstruct Lost Primary Frame via FEC Codec
  └─ Dispatch Decoded PCM16 Base64 to Browser over WebSocket
        │
        ▼  WebSocket Message (Browser)
[Browser Playout & Jitter Management]
  ├─ Duplicate & Late Arrival Sequence Filter
  ├─ Bounded Playout Queue (Target delay calculated via dynamic RFC 3550 formula)
  ├─ Multi-Stream Mixer:
  │    ├─ Separate AudioBufferSourceNode per active remote sender
  │    ├─ Dedicated GainNode per sender
  │    └─ Master Headroom Scaler: Dynamic gain attenuation (1 / sqrt(N))
  └─ Destination: AudioContext.destination (Speakers)
```

---

## 5. Security & Isolation Boundaries

### 1. Control Plane Security
- **Authentication:** Signed JSON Web Tokens (JWT) stored in `HttpOnly`, `SameSite=Strict` cookies.
- **Role Enforcement:** Role-based access control (`STUDENT`, `FACULTY`, `ADMIN`).
- **Authorization:** Only room owners and admins can modify room metadata or close rooms.

### 2. UDP Data Plane Security
- **HMAC Session Tokens:** UDP registrations require tokens signed with `UDP_SESSION_SECRET`.
- **IP & Port Pinning:** Once registered, datagrams with that `sessionId` are accepted *only* from the exact recorded remote `address` and `port`. Mismatches trigger `INVALID_ENDPOINT` drops and security warnings.
- **Wire MTU Clamping:** The socket parser enforces a strict 1200-byte wire limit *before* JSON parsing, neutralizing packet-flooding and memory-exhaustion exploits.
- **Room Isolation:** The `RoomRouter` uses in-memory session index mappings. Datagrams cannot cross room partitions under any circumstance.
- **Sender Non-Echo:** The router automatically filters out the sender session, preventing local echo loops.
- **Heartbeat & Dead Session Cleanup:** Sessions inactive for $> 15\text{ seconds}$ are pruned automatically.
