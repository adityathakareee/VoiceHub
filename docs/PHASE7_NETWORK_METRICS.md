# Phase 7 — Real-Time Network Monitoring & Telemetry Specification

## Architectural Overview & Design Checkpoint

Phase 7 integrates comprehensive, low-overhead network monitoring and telemetry across all tiers of the CSE Voice Hub architecture:
1. **UDP Data Plane (`udp-server`)**: Tracks sequence loss, packet drop count, and RFC 3550 inter-arrival jitter in `RoomRouter` and `UdpMetricsCollector`.
2. **Local Audio Companion Bridge (`local-bridge.ts`)**: Probes round-trip time (RTT) over UDP via `PING`/`PONG` exchanges, tracks rolling upstream/downstream bitrate (kbps), and streams real-time `NETWORK_METRICS` updates over WebSocket to the web client every 1 second.
3. **Control Plane (`backend`)**: Provides authenticated, role-authorized REST metrics endpoints (`GET /api/rooms/:roomCode/metrics`) and system-wide process telemetry (`GET /api/metrics`).
4. **React Frontend (`frontend`)**: Displays real-time Network Quality HUD (RTT, RFC 3550 Jitter, Packet Loss %, Bitrate, Quality Rating) within `AudioConferencePanel`.

---

## 1. Mathematical Formulas & Telemetry Algorithms

### A. RFC 3550 Inter-Arrival Jitter
According to RTP standard RFC 3550, jitter is calculated continuously as datagrams arrive.
Let:
- $S_i$: Transmission timestamp of packet $i$ (from sender packet header).
- $R_i$: Arrival timestamp of packet $i$ (local clock upon socket reception).
- $D(i-1, i) = (R_i - S_i) - (R_{i-1} - S_{i-1})$: Transit time variance between packet $i$ and $i-1$.

The inter-arrival jitter $J_i$ is updated recursively using a 16-sample smoothing filter:
$$J_i = J_{i-1} + \frac{|D(i-1, i)| - J_{i-1}}{16}$$

### B. Sequence Gap Detection & Packet Loss Percentage
Each transmitted audio frame carries a monotonically increasing integer sequence number ($seq$).
- If $seq = lastSequence$: Duplicate packet detected (ignored, duplicate counter incremented).
- If $seq < lastSequence$: Out-of-order / late packet detected.
- If $seq > lastSequence + 1$ (and $lastSequence > 0$):
  $$\text{packetsLost} \mathrel{+}= (seq - lastSequence - 1)$$
- Total expected packets:
  $$\text{totalExpected} = \text{packetsReceived} + \text{packetsLost}$$
- Packet Loss Percentage:
  $$\text{Loss Rate (\%)} = \frac{\text{packetsLost}}{\text{totalExpected}} \times 100\%$$

### C. Round-Trip Time (RTT / Latency)
- The companion bridge issues periodic `PING` datagrams every 2000ms containing transmission timestamp $T_{\text{sent}}$.
- The UDP server immediately responds with `PONG` echoing the original timestamp.
- Upon reception:
  $$\text{measuredRTT} = T_{\text{received}} - T_{\text{sent}}$$
  $$\text{SRTT} \leftarrow 0.875 \times \text{SRTT} + 0.125 \times \text{measuredRTT}$$

### D. Rolling Bitrate / Bandwidth Accounting
Throughput is calculated over a rolling 1000ms window:
$$\text{Bitrate (kbps)} = \frac{\Delta \text{Bytes} \times 8}{1000 \times \Delta t_{\text{sec}}}$$

### E. Network Quality Rating (ITU-T G.107 E-Model MOS Approximation)
| Quality Rating | Latency (RTT) | Jitter (RFC 3550) | Packet Loss | User Experience |
| :--- | :--- | :--- | :--- | :--- |
| **EXCELLENT** | $\le 60\text{ ms}$ | $\le 15\text{ ms}$ | $\le 1.0\%$ | Studio-grade, crystal-clear speech |
| **GOOD** | $\le 150\text{ ms}$ | $\le 30\text{ ms}$ | $\le 3.0\%$ | High quality, minimal perceptual delay |
| **FAIR** | $\le 300\text{ ms}$ | $\le 60\text{ ms}$ | $\le 8.0\%$ | Noticeable delay, slight distortion |
| **POOR** | $> 300\text{ ms}$ | $> 60\text{ ms}$ | $> 8.0\%$ | Degraded, robotic audio or dropouts |

---

## 2. Telemetry Protocol Specifications

### A. UDP Packet: `METRICS`
```typescript
{
  "version": 1,
  "type": "METRICS",
  "sessionId": "udp_sess_97854fb5d0171caf973ac0b1",
  "roomCode": "CVH-METRIC1",
  "timestamp": 1728138980452,
  "payload": {
    "rttMs": 1,
    "jitterMs": 0.12,
    "packetLossPercent": 0.0,
    "packetsSent": 60,
    "packetsReceived": 120,
    "packetsLost": 0,
    "bytesSent": 57600,
    "bytesReceived": 115200,
    "bitrateUpKbps": 64.0,
    "bitrateDownKbps": 128.0,
    "qualityRating": "EXCELLENT",
    "timestamp": 1728138980452
  }
}
```

### B. Companion Bridge WebSocket Event: `NETWORK_METRICS`
Broadcast automatically to the browser client every 1000ms (and upon `GET_METRICS` query):
```json
{
  "type": "NETWORK_METRICS",
  "metrics": {
    "rttMs": 4,
    "jitterMs": 0.0,
    "packetLossPercent": 0.0,
    "packetsSent": 150,
    "packetsReceived": 300,
    "packetsLost": 0,
    "bytesSent": 144000,
    "bytesReceived": 288000,
    "bitrateUpKbps": 64.0,
    "bitrateDownKbps": 128.0,
    "qualityRating": "EXCELLENT",
    "timestamp": 1728138982494
  }
}
```

### C. REST API Endpoints
1. `GET /api/rooms/:roomCode/metrics` (Requires Auth + Active Membership):
   - Returns active participant count, connected WebSocket sockets, muted count, speaking count, uptime in seconds, and control channel health (`HEALTHY`).
   - Non-members receive `HTTP 403 Forbidden`; unauthenticated requests receive `HTTP 401 Unauthorized`.
2. `GET /api/metrics` (System-wide Telemetry):
   - Returns Node process uptime, memory usage (`rssMb`, `heapTotalMb`, `heapUsedMb`), and telemetry status.

---

## 3. Verification & Test Commands

Execute the dedicated Phase 7 test suite:
```bash
npm run test:phase7
```
Execute the multi-user telemetry E2E audit:
```bash
npx ts-node udp-server/src/testing/test-phase7-multiuser-telemetry-e2e.ts
```

Execute full regression across all phases:
```bash
npm --prefix backend run test:auth
npm --prefix backend run test:rooms
npm --prefix udp-server run test:phase3
npm run test:audio
npm run test:multiuser
npm run test:phase6
npm run test:phase7
npm run build
```
Cumulative result: **157 / 157 Passed (100%)**, 0 build errors.
