# Phase 8 — Adaptive UDP & Rate Control Mechanisms Specification

## Architectural Overview & Design Checkpoint

Phase 8 introduces dynamic, resilient network adaptation and rate control mechanisms across the CSE Voice Hub architecture:
1. **Adaptive Rate Controller (`AdaptiveRateController`)**: Evaluates real-time network telemetry (RTT, RFC 3550 Jitter, Packet Loss %, Quality Rating) and dynamically modulates audio packetization, target profile, frame interval, and buffer sizing via Additive Increase / Multiplicative Decrease (AIMD).
2. **RFC 2198-Inspired Redundant Audio Payload Mechanism**: When packet loss meets or exceeds $2.0\%$, the sender buffers prior PCM frames and attaches an MTU-safe compact redundant audio payload to outgoing datagrams. When sequence gaps are detected on inbound streams ($seq = lastSeq + 2$), the receiver reconstructs the lost frame seamlessly without waiting for retransmission. This is an application-level JSON-encapsulated redundancy mechanism rather than a binary RTP RFC 2198 format.
3. **Dynamic Playout Buffer Delay**: Automatically sizes jitter playout delay using RFC 3550 recommendations: $\text{clamp}(20\text{ms}, 200\text{ms}, 2.5 \times J + 0.1 \times \text{RTT} + 15\text{ms})$ to maintain smooth playout while minimizing latency, connected directly to Web Audio `AudioContext` playback scheduling.
4. **Local Audio Companion Bridge (`local-bridge.ts`)**: Integrates rate adaptation per client session, dynamically sizes audio frames, enforces strict MTU safety ($\le 1200$ bytes) using compact redundancy and 8-bit companding for high-sample frames, accepts manual profile overrides from the browser, and broadcasts `ADAPTIVE_STATE_UPDATE` messages every 1000ms.
5. **Control Plane (`backend`)**: Provides authenticated, role-authorized REST configuration endpoints (`GET /api/rooms/:roomCode/adaptive-state`, `POST /api/rooms/:roomCode/adaptive-config`) allowing room owners and admins to inspect and enforce transmission policies.
6. **React Frontend (`frontend`)**: Displays real-time Adaptive UDP & Rate Control HUD with profile status, AIMD mode, target profile, playout delay, FEC status, and manual profile lock buttons. Captured audio frames dynamically chunk to the active profile's sample duration.

---

## 1. Transmission Profiles & Adaptation Matrix

> [!NOTE]
> **Audio Bitrate Reality Note**: Uncompressed 16kHz mono PCM16 has a physical raw bitrate of $16000 \times 2 \times 8 = 256\text{ kbps}$. The target bitrates listed below are logical transmission profile design targets. In CONSTRAINED and CRITICAL profiles under congestion, 8-bit companding reduces the raw PCM payload by 50% ($128\text{ kbps}$ on-wire raw audio), while packet pacing modulates transmission cadence from 66.7 to 25 packets/sec.

| Profile | Profile Target | Frame Interval | Nominal Samples (16kHz) | Raw PCM Bytes | Packet Cadence | Operational Condition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ULTRA** | 96 kbps | 15 ms | 240 samples | 480 bytes | 66.7 pkts/sec | Pristine connection sustained across 3+ intervals |
| **HIGH** | 80 kbps | 20 ms | 320 samples | 640 bytes | 50.0 pkts/sec | Excellent network conditions (Loss $\le 1.0\%$, RTT $\le 60\text{ms}$) |
| **STANDARD** | 64 kbps | 20 ms | 320 samples | 640 bytes | 50.0 pkts/sec | Nominal network conditions (Loss $\le 3.0\%$, RTT $\le 150\text{ms}$) |
| **CONSTRAINED** | 32 kbps | 25 ms | 400 samples | 800 bytes (400B companded) | 40.0 pkts/sec | Moderate congestion (Loss $> 3.0\%$ or RTT $> 150\text{ms}$) |
| **CRITICAL** | 16 kbps | 40 ms | 640 samples | 1280 bytes (640B companded) | 25.0 pkts/sec | Severe congestion (Loss $> 8.0\%$ or RTT $> 300\text{ms}$) |

---

## 2. Mathematical Formulas & Control Algorithms

### A. Additive Increase / Multiplicative Decrease (AIMD)
The adaptation engine uses AIMD to react quickly to congestion while cautiously reclaiming bandwidth:
- **Multiplicative Decrease (Severe Congestion)**:
  - Trigger: $\text{Loss} > 8.0\%$ OR $\text{RTT} > 300\text{ ms}$ OR $\text{Jitter} > 60\text{ ms}$ OR $\text{Rating} = \text{POOR}$.
  - Action: Immediately downshift to `CRITICAL` (40ms frame interval) and activate FEC.
- **Moderate Congestion Throttling**:
  - Trigger: $\text{Loss} > 3.0\%$ OR $\text{RTT} > 150\text{ ms}$ OR $\text{Jitter} > 30\text{ ms}$ OR $\text{Rating} = \text{FAIR}$.
  - Action: Downshift to `CONSTRAINED` (25ms frame interval) and activate FEC.
- **Nominal Downward Hysteresis**:
  - When connection degrades out of `EXCELLENT` into nominal conditions (e.g. Loss $\le 3.0\%$, RTT $\le 150\text{ms}$), profiles `ULTRA` and `HIGH` immediately step down to `STANDARD`.
- **Additive Increase (Pristine Network with Hysteresis)**:
  - Trigger: $\text{Loss} \le 1.0\%$ AND $\text{RTT} \le 60\text{ ms}$ AND $\text{Jitter} \le 15\text{ ms}$ AND $\text{Rating} = \text{EXCELLENT}$.
  - Hysteresis: Requires 3 consecutive 1-second intervals of pristine metrics before graduating to `ULTRA`. Steps from `CRITICAL`/`CONSTRAINED` $\rightarrow$ `STANDARD` $\rightarrow$ `HIGH` $\rightarrow$ `ULTRA`.
  - Action: Disable FEC when loss drops below $1.0\%$ to conserve bandwidth.

### B. RFC 2198-Inspired Redundant Audio Payload Mechanism & MTU Safety
- **Activation Threshold**: Packet Loss $\ge 2.0\% \implies \text{fecActive} = \text{true}$.
- **Deactivation Threshold**: Packet Loss $< 1.0\% \implies \text{fecActive} = \text{false}$.
- **MTU Safety Boundary**: UDP packet size is strictly bounded by `UDP_MAX_PACKET_SIZE` ($1200\text{ bytes}$).
  - Redundant audio frames are compactly downsampled and 8-bit companded (`factor = 4, 5, \text{or } 8`).
  - For frames $> 240$ samples with FEC active, primary payloads are companded to 8-bit (`pcm8`) to guarantee serialized datagrams stay strictly $\le 1200\text{ bytes}$.
- **Sender Payload Structure**:
  ```typescript
  interface FecAudioPayload {
    mediaType: string;            // 'audio/pcm16' or 'audio/pcm8'
    format: string;               // 'pcm16' or 'pcm8'
    decimateFactor?: number;      // Decimation factor for companded audio
    pcm: string;                  // Primary Base64 payload
    redundantSeq?: number;        // Sequence number of redundant frame
    redundantPcm?: string;        // Compact redundant payload
    redundantFactor?: number;     // Downsample factor for redundancy reconstruction
  }
  ```
- **Receiver Gap Recovery**:
  When an incoming audio frame arrives with sequence $seq = lastSeq + 2$ and contains a redundant payload with `redundantSeq == lastSeq + 1`:
  1. The missing frame $lastSeq + 1$ is immediately reconstructed using `decodeMtuSafeRedundancy` to full 16kHz PCM16 and emitted with `isFecRecovered: true`.
  2. The current frame $seq$ is expanded back to PCM16 (if companded) and emitted normally.
  3. The local `fecRecoveredCount` metric is incremented.

### C. Dynamic Playout Buffer Delay Calculation
According to RFC 3550 guidelines, playout delay adapts to measured network jitter and delay:
$$\text{Delay}_{\text{target}} = \text{clamp}\left(20\text{ ms},\, 200\text{ ms},\, 2.5 \times \text{Jitter} + 0.1 \times \text{RTT} + 15\text{ ms}\right)$$
The target delay is directly forwarded via Companion Bridge `ADAPTIVE_STATE_UPDATE` to `useRealtimeAudio.ts` which adjusts the Web Audio scheduling cursor (`stream.nextPlayTime = currentTime + targetDelaySec`).

---

## 3. WebSocket & REST Protocols

### A. Companion Bridge WebSocket Messages
- **`SET_TRANSMISSION_MODE`** (Client $\rightarrow$ Bridge):
  ```json
  { "type": "SET_TRANSMISSION_MODE", "mode": "MANUAL", "profile": "ULTRA" }
  ```
- **`GET_ADAPTIVE_STATE`** (Client $\rightarrow$ Bridge):
  ```json
  { "type": "GET_ADAPTIVE_STATE" }
  ```
- **`ADAPTIVE_STATE_UPDATE`** (Bridge $\rightarrow$ Client, every 1000ms):
  ```json
  {
    "type": "ADAPTIVE_STATE_UPDATE",
    "adaptiveState": {
      "mode": "AUTO",
      "profile": "ULTRA",
      "targetBitrateKbps": 96,
      "frameIntervalMs": 15,
      "fecActive": false,
      "fecRecoveredCount": 0,
      "targetPlayoutDelayMs": 20,
      "reason": "Additive Increase: Pristine connection sustained across 3+ intervals",
      "lastAdjustedTimestamp": 1791373300000
    }
  }
  ```

### B. Control Plane REST Endpoints
- **`GET /api/rooms/:roomCode/adaptive-state`**:
  - Auth: Authenticated room member or admin (`401` unauthenticated, `403` non-member).
  - Returns current room adaptive policy and configuration.
- **`POST /api/rooms/:roomCode/adaptive-config`**:
  - Auth: Room owner or admin only (`403` for non-owner members).
  - Body: `{ mode: "AUTO" | "MANUAL", targetProfile?: string, fecEnabled?: boolean, maxBitrateKbps?: number }`.

---

## 4. Verification Summary

- **Unit & Controller Tests (`npm run test:phase8`)**: 30/30 PASSED.
- **Multi-User Adaptive E2E Suite (`npm run test:phase8:e2e`)**: 8/8 PASSED.
- **Full Monorepo Build (`npm run build`)**: PASSED (0 errors).
- **Regression Suites (Phases 1–7)**: 157/157 PASSED.
- **Browser E2E Flow**: Verified real-time HUD rendering, live audio connection, automatic AIMD evaluation, and reactive manual profile override.

