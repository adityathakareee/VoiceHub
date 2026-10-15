# Phase 4 — Real-Time Audio Architecture

## Overview & Architecture Checkpoint

In CSE Voice Hub, the course project requirement mandates a **UDP-based Multithreaded Real-Time Audio-Conferencing Client-Server System**.

Because standard web browsers cannot open arbitrary, raw UDP sockets via Node `dgram`, we evaluated three primary architectural options for integrating the React frontend with the real UDP server:

### Evaluation of Options

1. **Option A: WebRTC Media Transport**
   - *Pros*: Built-in browser media API.
   - *Cons*: Bypasses the custom UDP socket server and `RoomRouter` data plane entirely. Fails the core course requirement to demonstrate custom UDP transport.

2. **Option B: Local Companion Bridge Process (Selected Architecture)**
   - *Pros*:
     - Retains the existing React + Vite frontend for UI, auth, and room controls.
     - Preserves 100% of the Phase 3 custom UDP networking core (`UdpSocketService`, `UdpClientRegistry`, `RoomRouter`, `HeartbeatManager`).
     - Uses real Node.js `dgram` UDP sockets to communicate with `0.0.0.0:5001`.
     - Completely isolated and secure (binds only to loopback `127.0.0.1:5002`).
   - *Cons*: Requires a lightweight local companion script running on each client machine.

3. **Option C: Native Desktop Client (Electron/Tauri)**
   - *Pros*: Direct access to native UDP and audio devices.
   - *Cons*: Massive scope change away from the existing web application experience.

---

## End-to-End Media Flow

```text
  [ USER A BROWSER ]                    [ USER A COMPANION ]                  [ UDP SERVER ]                 [ USER B COMPANION ]                   [ USER B BROWSER ]
 (React UI + WebAudio)                    (Node dgram UDP)                    (0.0.0.0:5001)                  (Node dgram UDP)                    (React UI + WebAudio)
          │                                      │                                  │                                │                                        │
 1. Mic capture (16kHz PCM16)                   │                                  │                                │                                        │
          │─── WebSocket (ws://127.0.0.1:5002) ──►│                                  │                                │                                        │
          │    PCM Frame (640 bytes / 20ms)      │                                  │                                │                                        │
          │                                      │─── UDP DATA Packet ─────────────►│                                │                                        │
          │                                      │    (JSON payload with seq)       │                                │                                        │
          │                                      │                                  │─── UDP DATA Packet ───────────►│                                        │
          │                                      │                                  │    (Room Router Forwarding)    │                                        │
          │                                      │                                  │                                │─── WebSocket (ws://127.0.0.1:5002) ───►│
          │                                      │                                  │                                │    PCM Frame (640 bytes / 20ms)       │
          │                                      │                                  │                                │                                        │ 2. Jitter buffer &
          │                                      │                                  │                                │                                          WebAudio Playback
```

---

## Technical Specifications

### Audio Parameters
- **Sample Rate**: 16,000 Hz (16 kHz mono)
- **Sample Format**: Signed 16-bit PCM (PCM16, Little-Endian)
- **Channels**: 1 (Mono)
- **Frame Duration**: 20 ms
- **Frame Sample Count**: 320 samples
- **Frame Byte Size**: 640 bytes (320 samples × 2 bytes/sample)

### Security & Token Boundaries
- **Token Acquisition**: Frontend calls `POST /api/rooms/:roomCode/udp-token` via authenticated Express REST API using HttpOnly cookie authentication.
- **Token Passing**: Frontend passes short-lived UDP token to local companion over local WebSocket connection (`ws://127.0.0.1:5002`).
- **Secret Isolation**: `UDP_SESSION_SECRET` is kept strictly on the backend and UDP server. Tokens expire in 5 minutes.
- **Local Bridge Security**: WebSocket bridge binds strictly to `127.0.0.1`. Cross-origin verification restricts connections to allowed frontend origins (`http://localhost:5173`).

---

## Deployment & Setup Instructions (Windows 11)

To run CSE Voice Hub with Phase 4 Real-Time Audio:

1. **Start MongoDB**: Ensure local MongoDB is active on `mongodb://localhost:27017`.
2. **Start Backend API** (Terminal 1): `npm run dev:backend`
3. **Start UDP Server** (Terminal 2): `npm run dev:udp`
4. **Start Local Audio Companion Bridge** (Terminal 3): `npm run dev:bridge`
5. **Start Frontend Dashboard** (Terminal 4): `npm run dev:frontend`
