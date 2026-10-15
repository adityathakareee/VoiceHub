# CSE Voice Hub — UDP Architecture Specification (Phase 3)

## 1. Executive Overview

Phase 3 establishes the **Real-Time Data Plane** for CSE Voice Hub using native Node.js UDP sockets (`dgram`). The system enforces strict separation between the **Control Plane** (HTTP/REST Express + MongoDB) and the **Data Plane** (Standalone UDP Server).

```text
                    CONTROL PLANE (TCP / HTTP)
                    ──────────────────────────

React Web Frontend
       │
       │ HTTP REST
       ▼
Express API Backend ────────► MongoDB (Persistent Users & Rooms)
       │
       │ Issues Short-Lived (5m) UDP Session Token
       ▼
UDP Client Application


                    DATA PLANE (UDP Socket)
                    ───────────────────────

UDP Client A (Room A)
       │
       │ UDP REGISTER (with Session Token)
       ▼
┌────────────────────────────────────────────────────────┐
│ Standalone UDP Server (Port 5001)                      │
│                                                        │
│  ├── Token Verifier (Cryptographic JWT Check)          │
│  ├── Client Registry (In-Memory Session Map)           │
│  ├── Packet Parser & Validator (1200 Byte Size Limit)  │
│  ├── Room Router (Isolated Room-to-Room Packet Relay)  │
│  └── Heartbeat Manager (15s Auto-Timeout Cleanup)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           │ UDP DATA Packet (Sequence Numbered)
                           ├──────────────► UDP Client B (Room A)
                           │
                           └────────X─────► UDP Client D (Room B - Isolated!)
```

---

## 2. Control Plane vs Data Plane Separation

### Control Plane (Express REST API)
- **Authentication**: JWT HttpOnly cookie session auth.
- **Trust Boundary**: Express verifies user accounts, room existence, room status (`ACTIVE`), and active participant membership.
- **Session Token Generation**: `POST /api/rooms/:roomCode/udp-token` issues a short-lived (5-minute) token containing `{ userId, roomCode, role }` signed with `UDP_SESSION_SECRET`.
- **Database Access**: MongoDB is accessed ONLY during HTTP control plane operations.

### Data Plane (UDP Server on Port 5001)
- **Transport**: Native Node.js `dgram` IPv4 socket (`udp4`).
- **Session Registration**: The UDP server verifies the cryptographic token on `REGISTER` packets.
- **Zero Database Overhead**: The UDP server does NOT query MongoDB during packet routing. Routing decisions use the fast in-memory `UdpClientRegistry`.
- **Room Isolation**: Packets from Room A are forwarded ONLY to active sessions registered in Room A.

---

## 3. Web Browser UDP Constraint & Test Architecture

> [!CAUTION]
> **Browser Raw UDP Limitation**: Standard web browser execution environments (Chrome, Firefox, Edge, Safari) cannot directly open raw Node.js `dgram` UDP sockets due to browser sandbox security rules.

To maintain real network protocol integrity without writing fake browser APIs:
- The React web application controls room creation, joining, and signaling via Express HTTP.
- Real UDP packet transmission, session registration, sequence tracking, and room-isolated routing are executed using the dedicated Node.js test client (`udp-client.ts`).

---

## 4. Concurrency Model & Multithreading Architecture Note

Node.js uses an **event-driven, non-blocking I/O model** for networking. A single `dgram` socket process handles thousands of concurrent UDP packet events per second asynchronously on the event loop.

Worker threads (`worker_threads`) will be introduced in future phases (Phase 4/5) specifically for CPU-intensive PCM audio mixing and codec transformations where thread parallelism provides genuine architectural benefit.
