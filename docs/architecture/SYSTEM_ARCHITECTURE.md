# CSE Voice Hub — System Architecture Specification

> **Phase 0 Architectural Blueprint**
> *Computer Engineering Department Real-Time Audio Conferencing Platform*

---

## 1. Executive Summary

CSE Voice Hub is engineered with a strict **dual-channel decoupled architecture**:
1. **Control & Signaling Channel (HTTP REST / WebSockets)**: Manages application state, authentication, room lifecycle, participant presence, and telemetry metadata.
2. **Real-Time Media Transport Channel (UDP Sockets)**: Manages low-latency audio transmission, sequence numbering, jitter buffer management, and adaptive bitrate control.

```text
                               CSE VOICE HUB
                                     │
                                     ▼
                           ┌──────────────────┐
                           │ React Frontend   │
                           │ Vite + TypeScript│
                           └────────┬─────────┘
                                    │
                              REST / WebSocket (Control)
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ Node.js/Express  │
                           │ Application API  │
                           └────────┬─────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │     MongoDB      │
                           │    + Mongoose    │
                           └──────────────────┘


                         REAL-TIME MEDIA LAYER

                           ┌──────────────────┐
                           │   UDP Service    │
                           │   Node.js dgram  │
                           └──────────────────┘
                                    │
                                    ▼
                           Future Audio Clients
```

---

## 2. Channel Responsibilities & Separation of Concerns

### 2.1 REST API & WebSocket Control Layer (`/backend`)
* **Technology**: Node.js, Express, TypeScript, Mongoose, Zod.
* **Responsibilities**:
  * User Registration & Authentication (JWT HttpOnly cookie - Phase 1)
  * Conference room creation, unique code generation (`CVH-XXXXXX`), ownership, join/leave/close operations (Phase 2)
  * RoomMember active state tracking and database-level partial unique index constraints (Phase 2)
  * Participant presence events (join, leave, mute, unmute - Phase 6)
  * System health probes (`/api/health`) and admin analytics
* **Transport**: TCP/IP (reliable, ordered delivery)

### 2.2 Standalone UDP Networking Server (`/udp-server`)
* **Technology**: Node.js, TypeScript, Native `dgram` module (`udp4`).
* **Responsibilities**:
  * Direct packet listening and demuxing on configured host/port (`0.0.0.0:5001`)
  * Low-latency audio packet routing between room participants (Phase 3 - 5)
  * Real-time packet header parsing (sequence number, timestamp, client ID)
  * Network metric computation (latency, jitter, packet loss - Phase 7)
  * Adaptive transmission & rate adjustment algorithms (Phase 8)
* **Transport**: UDP/IPv4 (unreliable, unordered, minimum latency)

### 2.3 Database Layer (`/database`)
* **Technology**: MongoDB + Mongoose ODM.
* **Responsibilities**:
  * Persistent storage for users, rooms, configurations, and aggregate session metrics.
* **CRITICAL ARCHITECTURAL RULE**: **Audio packets MUST NEVER be stored in MongoDB.** Real-time audio data resides strictly in volatile UDP socket buffers during active transmission.

---

## 3. Critical Browser / UDP Architecture Constraint

> [!CAUTION]
> **Browser Networking Limitation**: Standard web browser JavaScript execution environments (Chrome, Firefox, Edge, Safari) CANNOT directly invoke Node.js `dgram` APIs or open arbitrary raw UDP sockets due to sandboxed browser security rules.

### Evaluation of Technical Options for Phase 4 Audio Transport

To fulfill the course requirement of genuine UDP networking while preserving web usability, the system will evaluate two valid architectural options prior to Phase 4:

#### Option A — WebRTC Media Transport Stack
* **Mechanism**: WebRTC uses UDP at the transport layer underneath ICE/STUN/SRTP.
* **Pros**: Native browser support, hardware audio capture, built-in echo cancellation.
* **Cons**: Additional WebRTC negotiation overhead.

#### Option B — Web Frontend + Native Local UDP Audio Bridge Client
* **Mechanism**: A lightweight native audio client (e.g., C++/Rust/Node daemon) handles microphone audio capture and communicates directly over raw UDP sockets to `udp-server:5001`, while the React web frontend controls room selection and signaling via the Express REST/WebSocket server.
* **Pros**: Direct raw UDP socket control, exact packet header customization, ideal for network protocol research.
* **Cons**: Requires installing a small helper binary on client machines.

The final transport strategy will be selected and validated during Phase 3/4 planning.
