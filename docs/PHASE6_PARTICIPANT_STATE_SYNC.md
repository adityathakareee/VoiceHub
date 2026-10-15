# Phase 6 — Real-Time Participant State Synchronization

## 1. Overview & Purpose
Phase 6 implements the **Control Channel Real-Time Participant State & Presence Synchronization** for the CSE Voice Hub audio conferencing platform. 

While raw audio data travels over low-latency UDP datagrams (Media Plane on port 5001 & Companion Bridge on port 5002), participant presence, microphone mute/unmute status, speaking indicators (voice activity detection), room metadata updates, and room lifecycle events travel reliably over the **Control Plane** (attached to the Express server on port 5000 via `/ws/control`).

---

## 2. Separation of Planes

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                    |
|                                                                                   |
|  [React RoomDetailView]                  [Web Audio Graph & Local Capture]        |
|          │                                             │                          |
|          │ (TCP / WebSocket)                           │ (Local WS bridge)        |
|          ▼                                             ▼                          |
|  /ws/control                                 ws://127.0.0.1:5002                  |
|  (Express Backend :5000)                     (Companion Bridge)                   |
|          │                                             │                          |
|          ▼                                             ▼ (UDP Datagrams)          |
|  [ControlWsService]                          0.0.0.0:5001 (UDP Server)            |
|  - Join/Leave presence                       - Low-latency audio forwarding       |
|  - Mute/Unmute state sync                    - Non-echo routing                   |
|  - Active speaker indications                - Multi-stream mixing                |
|  - Room update/close events                                                       |
+-----------------------------------------------------------------------------------+
```

---

## 3. Control Channel WebSocket Protocol (`/ws/control`)

### Connection & Upgrade Handshake
* **Endpoint**: `ws://<host>:5000/ws/control?roomCode=<CVH-XXXXXX>&token=<JWT>`
* **Authentication**: Cookie-based (`cse_voice_hub_auth`) or URL Query Parameter `token`.
* **Authorization**: The connecting user must be an `ACTIVE` participant of the specified room in MongoDB (`RoomMember` model). Non-members or unauthenticated callers are rejected with HTTP 401/403 before upgrade.

### Event Catalog

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `ROOM_SYNC` | Server -> Client | `{ roomCode, participants: [...] }` | Initial snapshot of all currently connected participants with their live mute and speaking states upon connection. |
| `PARTICIPANT_JOINED` | Server -> Broadcast | `{ roomCode, participant: {...} }` | Broadcast to all other peers in the room when a participant connects to the control channel. |
| `PARTICIPANT_LEFT` | Server -> Broadcast | `{ roomCode, userId }` | Broadcast when a participant disconnects or leaves the room. |
| `SET_MUTE` | Client -> Server | `{ type: 'SET_MUTE', isMuted: boolean }` | Sent by client when user toggles microphone mute. |
| `PARTICIPANT_MUTED` | Server -> Broadcast | `{ roomCode, userId, isMuted }` | Broadcast to all clients in the room to update participant mute badges in real time. |
| `SET_SPEAKING` | Client -> Server | `{ type: 'SET_SPEAKING', isSpeaking: boolean }` | Sent by client audio processor when voice activity is detected. |
| `PARTICIPANT_SPEAKING` | Server -> Broadcast | `{ roomCode, userId, isSpeaking }` | Broadcast to all clients in the room to animate active speaker borders and badges. |
| `ROOM_UPDATED` | Server -> Broadcast | `{ roomCode, room: { name, description, maxParticipants } }` | Triggered when room owner edits room details via REST API. |
| `ROOM_CLOSED` | Server -> Broadcast | `{ roomCode }` | Triggered when host/admin closes the room via REST API; terminates active presence sockets. |
| `PING` / `PONG` | Bidirectional | `{ type: 'PING' }` / `{ type: 'PONG' }` | Liveness heartbeat check every 15 seconds. |

---

## 4. REST API Fallback Endpoints

* **`GET /api/rooms/:roomCode/presence`**:
  Returns current list of connected participants, active connection count, and their real-time `isMuted` and `isSpeaking` states.
* **`POST /api/rooms/:roomCode/state`**:
  Body: `{ "isMuted": boolean }`
  Updates participant state on the server and broadcasts `PARTICIPANT_MUTED` to all connected clients.

---

## 5. Automated Verification Results

All 15 Phase 6 test scenarios pass in `backend/src/testing/test-phase6-state-sync.ts`:
```bash
npm run test:phase6
```

1. Room creation and membership setup.
2. Safe rejection of unauthenticated WebSocket upgrade (HTTP 401).
3. Safe rejection of unauthorized non-member WebSocket upgrade.
4. Reception of initial `ROOM_SYNC` presence snapshot.
5. Real-time `PARTICIPANT_JOINED` broadcast propagation.
6. Real-time `PARTICIPANT_MUTED` (mute = true) broadcast.
7. Real-time `PARTICIPANT_MUTED` (unmute = false) broadcast.
8. Real-time `PARTICIPANT_SPEAKING` voice activity broadcast.
9. Accurate REST `GET /api/rooms/:roomCode/presence` reporting.
10. Fallback REST `POST /api/rooms/:roomCode/state` state update & broadcast.
11. Real-time `ROOM_UPDATED` metadata update broadcast.
12. Real-time `PARTICIPANT_LEFT` leave notification broadcast.
13. Live `ROOM_CLOSED` event propagation and socket termination.
14. Graceful socket and memory cleanup.
