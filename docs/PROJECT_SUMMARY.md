# CSE VOICE HUB — MASTER TECHNICAL PROJECT SUMMARY

## 1. Project Identification
- **Project Title:** CSE Voice Hub — Adaptive UDP-Based Multithreaded Real-Time Audio Conferencing System
- **Curriculum Domain:** Computer Networks & Telecommunications (CNT) / Advanced Systems Engineering
- **Baseline Status:** Phases 0 through 11 Complete (270 / 270 Automated Tests Passed, 0 Build Errors)

---

## 2. Problem Statement
Standard internet voice streaming over connectionless User Datagram Protocol (UDP) faces acute degradation during network volatility:
1. **Unmanaged Packet Loss:** Drops conversational audio frames, introducing distortion and severe speech clipping.
2. **Packet Delay Variation (Jitter):** Creates queue starvation or buffer overflows in fixed-latency playback receivers.
3. **Congestion Collapse & Bufferbloat:** Blind, fixed-rate transmission exacerbates bottleneck queue occupancy, increasing one-way delay beyond the acceptable conversational ceiling ($> 150-200\text{ ms}$).

---

## 3. Engineered Solution
The **CSE Voice Hub** resolves these challenges by decoupling transactional conference management from real-time media transmission, implementing a closed-loop adaptive UDP stack that continuously regulates transmission rate, packet framing, application redundancy, and playback delay in response to real-time network telemetry.

---

## 4. Architectural Summary

```
[Browser Client] <--- REST / WebSocket Presence ---> [Control Plane API (Port 5000)] <---> [MongoDB Database]
       │
       │ Localhost Audio (Web Audio API)
       ▼
[Companion Bridge (Port 5002)] <--- Bidirectional UDP (dgram) ---> [UDP Media Server (Port 5001)]
```

- **Control Plane (`localhost:5000`):** Manages user authentication (JWT HttpOnly cookies), room lifecycles, active presence synchronization, and cryptographically mints HMAC session tokens.
- **Companion Bridge (`127.0.0.1:5002`):** Local WebSocket-to-UDP adapter enabling standard browser Web Audio applications to transmit and receive low-latency native UDP datagrams without browser plugin requirements.
- **UDP Media Server (`127.0.0.1:5001`):** Connectionless packet router enforcing endpoint authentication, room isolation, non-echo forwarding, and telemetry ingestion.

---

## 5. Technical Specifications Matrix

| Component | Technical Specification |
| :--- | :--- |
| **Audio Representation** | 16,000 Hz, 1-Channel (Mono), Signed 16-Bit Linear PCM (PCM16) |
| **Transmission Profiles** | `ULTRA` (96k, 15ms), `HIGH` (80k, 20ms), `STANDARD` (64k, 20ms), `CONSTRAINED` (32k, 25ms), `CRITICAL` (16k, 40ms) |
| **Wire MTU Boundary** | Strict $\le 1200\text{ Bytes}$ per UDP datagram |
| **Congestion Control** | Additive Increase / Multiplicative Decrease (AIMD) with 3-interval stability hysteresis |
| **Forward Error Correction** | RFC 2198-inspired single-packet redundancy with 8-bit companding and decimation |
| **Playout Buffer Formula** | $\text{targetPlayoutDelayMs} = \text{clamp}(20\text{ms}, 200\text{ms}, 2.5 \times \text{jitter} + 0.1 \times \text{RTT} + 15\text{ms})$ |
| **Jitter Calculation** | RFC 3550 first-order recursive inter-arrival delay variance filter |
| **Security Layer** | JWT (Control Plane), HMAC-SHA256 Session Tokens, IP/Port Pinning, Stale Session Pruning |
| **Multi-User Audio** | Web Audio multi-stream node graph with dynamic master gain headroom ($1/\sqrt{N}$) |

---

## 6. Empirical Performance Verification (Phase 10 Baseline)

| Metric | Pristine Baseline | Degraded Channel (Congested) | Post-Recovery Channel |
| :--- | :--- | :--- | :--- |
| **Round-Trip Time (RTT)** | `0.58 ms` (Min) / `2.31 ms` (Avg) | `150 – 340 ms` | `15 ms` |
| **RFC 3550 Jitter** | `1.20 ms` | `28 – 65 ms` | `1.50 ms` |
| **Packet Loss Rate** | `0.00 %` | `5.00 – 9.50 %` | `0.00 %` |
| **Active Profile** | `ULTRA` (96 kbps) | `CONSTRAINED` (32k) / `CRITICAL` (16k) | Steps to `STANDARD` $\to$ `HIGH` $\to$ `ULTRA` |
| **FEC Status** | Inactive (0% loss) | Active ($\ge 2.0\%$ loss threshold) | Deactivated ($< 1.0\%$ threshold) |
| **Playout Buffer Delay** | `20 ms` (Nominal clamp) | `100 – 200 ms` (Dynamic expansion) | `20 ms` |
| **FEC Loss Recovery** | N/A | **100%** of single-packet gaps restored | N/A |
| **Bandwidth Reduction** | Nominal | **50% – 75%** transmission rate reduction | Nominal |

---

## 7. Automated Test Suite Summary (270 / 270 PASS)

```
Phase 1  — User Authentication & Security:          28 / 28 PASS
Phase 2  — Conference Rooms & Membership:           34 / 34 PASS
Phase 3  — UDP Networking Core:                     19 / 19 PASS
Phase 4  — Real-Time Audio Transport:               18 / 18 PASS
Phase 5  — Multi-User Audio Conferencing:           13 / 13 PASS
Phase 6  — Real-Time State Synchronization:         18 / 18 PASS
Phase 7  — Network Monitoring & Metrics:            20 / 20 PASS
Phase 7  — Multi-User E2E Network Telemetry:         7 /  7 PASS
Phase 8  — Adaptive UDP & Rate Control:             30 / 30 PASS
Phase 8  — Multi-User E2E Adaptive Control:          8 /  8 PASS
Phase 9  — Security Hardening & Reliability:        31 / 31 PASS
Phase 10 — Empirical Performance Evaluation:        44 / 44 PASS
-----------------------------------------------------------------
TOTAL AUTOMATED REGRESSION VERIFICATION:           270 / 270 PASS (100%)
MONOREPO BUILD VERIFICATION (tsc & vite build):       0 ERRORS
```

---

## 8. Limitations & Scope Constraints
1. **Hardware Audio Transducers:** Physical acoustic microphone elements and loudspeaker hardware were not evaluated in automated continuous integration; tests utilized synthetic sine-wave buffers and Web Audio streams.
2. **WAN Network Emulation:** Packet loss, jitter, and delay variations were injected via software simulation and telemetry queues rather than physical hardware link impairment appliances.
3. **Codec Compression:** The system utilizes non-linear 8-bit companding rather than an advanced psychoacoustic codec like IETF Opus.
4. **Single-Node Topology:** The current media server is a centralized router and does not feature an inter-server routing mesh for multi-region clustering.
