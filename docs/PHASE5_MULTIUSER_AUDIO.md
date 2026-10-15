# Phase 5 — Multi-User Audio Conferencing & Mixing Architecture

## Architectural Overview & Design Checkpoint

Phase 5 extends the CSE Voice Hub real-time audio pipeline from 2-participant bidirectional audio to **multi-user audio conferencing** (supporting 3+ simultaneous active participants per room).

---

## 1. Key Design Decisions

### A. Client-Side Web Audio API Stream Mixing vs. Server-Side Mixing
- **Decision**: **Client-side Web Audio API mixing**.
- **Rationale**:
  1. Preserves the UDP server's role as a lightweight, low-latency datagram router.
  2. The browser's native Web Audio API provides hardware-accelerated audio mixing via node graphs (`GainNode`, `AudioBufferSourceNode`).
  3. Gives each client independent volume and mute control over individual remote participants.

### B. Participant Audio Stream Identification
- Every audio frame transmitted over UDP and forwarded via the local companion bridge contains explicit sender identities:
  `senderSessionId` (unique UDP session) and `senderClientId` (unique user identity).
- The frontend `useRealtimeAudio` hook maintains a `Map<string, RemoteAudioStream>` keyed by `senderSessionId`.

### C. Self-Echo Prevention
- **Server Enforcement**: The UDP server `RoomRouter` strictly filters out the sender (`targetSessions = roomSessions.filter(s => s.sessionId !== senderSession.sessionId)`).
- **Client Enforcement**: The frontend discards any frame matching the client's own `sessionId`.

### D. Audio Headroom & Clipping Prevention
- When multiple remote participants talk concurrently, summing their PCM signals directly could cause digital clipping (samples exceeding `+1.0` or `-1.0`).
- To prevent clipping, a **Master Gain Node** dynamically scales overall playout volume:
  $$\text{Gain} = \frac{1}{\sqrt{\max(1, N)}}$$
  where $N$ is the number of active remote audio streams.

### E. Per-Participant Jitter Buffer & Playout Queue
- Each remote participant stream maintains an independent playout queue (`nextPlayTime`).
- **Bounded Playout Buffer**: Maximum queue depth is capped at 10 frames (200ms). Older or late frames exceeding 200ms lag are dropped.
- **Duplicate Sequence Filtering**: Late or duplicate sequence numbers are tracked and rejected per sender session.

---

## 2. Multi-User End-to-End Data Flow

```text
 [ ROOM CVH-123 ]
 Participant A (Session A) ──► UDP Server ──► Forwarded to Session B & Session C
 Participant B (Session B) ──► UDP Server ──► Forwarded to Session A & Session C
 Participant C (Session C) ──► UDP Server ──► Forwarded to Session A & Session B

 [ PARTICIPANT A WEB AUDIO GRAPH ]
  Remote Stream B (Session B) ──► GainNode B ──┐
                                               ├──► Master GainNode ──► AudioContext.destination
  Remote Stream C (Session C) ──► GainNode C ──┘
```

---

## 3. Protocol & Data Formats

- **UDP Datagram**: 964 bytes JSON payload containing 20ms mono PCM16 @ 16kHz (640 bytes PCM -> 854 bytes Base64). Fits under 1200-byte `UDP_MAX_PACKET_SIZE`.
- **WebSocket Bridge Message**:
  ```json
  {
    "type": "AUDIO_FRAME",
    "senderSessionId": "udp_sess_b123",
    "senderClientId": "client_userB",
    "sequence": 142,
    "timestamp": 1758912000000,
    "pcm": "<Base64 PCM16>"
  }
  ```

---

## 4. Manual 3-Participant Hardware Acceptance Checklist

To test 3 participants with real devices:

1. **Start Services**:
   - `npm run dev:backend`
   - `npm run dev:udp`
   - `npm run dev:bridge`
   - `npm run dev:frontend`

2. **Open 3 Browser Windows**:
   - Window 1 (User A): Login, Create Room `CVH-XXXXXX`, Click **"Connect Audio"**.
   - Window 2 (User B): Login, Join Room `CVH-XXXXXX`, Click **"Connect Audio"**.
   - Window 3 (User C): Login, Join Room `CVH-XXXXXX`, Click **"Connect Audio"**.

3. **Verify Audio**:
   - User A speaks: User B and User C hear User A. User A hears no self-echo.
   - User B speaks: User A and User C hear User B.
   - User C speaks: User A and User B hear User C.
   - User A & B speak together: User C hears both mixed clearly without distortion.
   - User A Mutes: User B and C observe User A's mic status set to Muted and User A's voice stops.
   - User B Leaves: User A and C observe User B's stream cleaned up smoothly.
