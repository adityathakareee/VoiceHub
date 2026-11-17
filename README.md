# CSE Voice Hub

> **Adaptive UDP-Based Multithreaded Real-Time Audio Conferencing System**  
> *Computer Engineering Department Capstone & Networking Course Project*

---

## Project Status

```text
Phases 0–10 Status: COMPLETE & ACCEPTED
Cumulative Automated Tests: 270 / 270 PASS (100%)
Monorepo Production Build: 0 TypeScript / Vite Errors
Active Phase: Phase 11 (Finalization & Research Documentation)
```

The CSE Voice Hub is an open, instrumented, application-level real-time audio conferencing platform built from first principles. It decouples reliable HTTP/REST and WebSocket conference management from low-latency, connectionless User Datagram Protocol (UDP) media transport, featuring closed-loop rate adaptation, dynamic playout buffering, and application-level forward error correction (FEC).

---

## Key Features

- **Decoupled Architecture:** Clean separation between transactional Control Plane (Express, MongoDB, WebSockets) and low-latency Data Plane (UDP Media Server, Companion Bridge).
- **Adaptive UDP Engine:** Deterministic Additive Increase / Multiplicative Decrease (AIMD) controller dynamically switching across 5 transmission profiles (16 kbps to 96 kbps).
- **RFC 2198-Inspired FEC:** Application-level redundant audio payload with 8-bit non-linear companding and decimation, ensuring strict compliance with the **1200-byte wire MTU** limit.
- **Dynamic Playout Buffering:** Jitter buffer delay sizing automatically scaling with RFC 3550 inter-arrival jitter and round-trip time: $\text{clamp}(20\text{ms}, 200\text{ms}, 2.5 \times \text{jitter} + 0.1 \times \text{RTT} + 15\text{ms})$.
- **Multi-User Room Routing:** Centralized in-memory router enforcing strict room isolation and sender non-echo packet filtering.
- **Client-Side Multi-Stream Mixing:** Web Audio API graph supporting concurrent talkers with dynamic master gain headroom scaling ($1/\sqrt{N}$) preventing clipping.
- **Robust Security:** Signed `HttpOnly` JWT cookie authentication, role-based access control, HMAC-SHA256 UDP session tokens, source IP/port anti-spoofing binding, and stale session reclamation.
- **Empirical Validation:** 270 automated test checkpoints verifying every aspect from unit logic to multi-user scalability under simulated degradation.

---

## High-Level System Architecture

```text
                                  CLIENT LAYER (BROWSER)
                    ┌─────────────────────────────────────────────────┐
                    │               React 18 SPA (Vite)               │
                    │        Telemetry HUD  │  Adaptive HUD           │
                    │      Web Audio Capture │ Web Audio Mixing       │
                    └───────────────┬─────────────────┬───────────────┘
                                    │                 │
                           REST / WebSocket           │ Local PCM
                           (Control Plane)            │ (ws://127.0.0.1:5002)
                                    │                 │
                                    ▼                 ▼
                      ┌──────────────────┐   ┌───────────────────────┐
                      │  Control Plane   │   │   Companion Bridge    │
                      │ Express (Port 5000)│ │  (Port 5002 Localhost) │
                      └────────┬─────────┘   └──────────┬────────────┘
                               │                        │
                          Mongoose ORM                  │ Native UDP Datagrams
                               │                        │ (1200-Byte MTU Clamp)
                               ▼                        ▼
                      ┌──────────────────┐   ┌───────────────────────┐
                      │ MongoDB Database │   │   UDP Media Server    │
                      │  Port 27017      │   │  (Port 5001 / dgram)  │
                      └──────────────────┘   └───────────────────────┘
```

---

## Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Web Audio API (`AudioContext`, `GainNode`).
- **Control Plane API:** Node.js, Express, TypeScript, WebSocket (`ws`), Mongoose ORM.
- **Database:** MongoDB (Local or Atlas URI).
- **Media Plane Server:** Node.js `node:dgram` UDP sockets, TypeScript.
- **Companion Bridge:** Node.js WebSocket server + UDP socket client.
- **Testing & Tooling:** TypeScript (`ts-node`), custom empirical evaluation suites.

---

## Project Structure

```text
CourseProject/
├── backend/                  # Control Plane: REST API, Auth, Rooms, WebSocket Presence
│   ├── src/models/           # Mongoose schemas (User, Room, RoomMember)
│   ├── src/routes/           # Express API endpoints
│   ├── src/websocket/        # Control Plane WebSocket server (/ws/control)
│   └── src/testing/          # Phases 1, 2, 6 verification suites
├── udp-server/               # Media Plane & Companion Bridge
│   ├── src/networking/       # UDP socket service, registry, router, adaptive controller
│   ├── src/bridge/           # Local Companion Bridge (ws://127.0.0.1:5002)
│   ├── src/security/         # HMAC session tokens, packet parser, validator
│   └── src/testing/          # Phases 3, 4, 5, 7, 8, 9, 10 performance suites
├── frontend/                 # React 18 Single Page Application
│   ├── src/components/       # Audio controls, Telemetry HUD, Adaptive HUD
│   └── src/services/         # REST API, WebSocket client, Web Audio mixing pipeline
├── docs/                     # Comprehensive Architecture, Research & Test Documentation
│   ├── INDEX.md              # Central documentation index
│   ├── FINAL_ARCHITECTURE.md # System architecture & control/data plane separation
│   ├── UDP_PROTOCOL.md       # Definitive UDP packet protocol specification
│   ├── ADAPTIVE_UDP.md       # AIMD algorithm, profiles, FEC, playout formula
│   ├── RESEARCH_AND_LITERATURE.md # Problem statement, gap, RFC citations, comparison
│   ├── REPRODUCIBILITY.md    # Step-by-step setup and test execution commands
│   ├── FINAL_DEMO_FLOW.md    # Scripted presentation and demonstration sequence
│   ├── VIVA_PREPARATION.md   # 29 technical interview and academic defense questions
│   └── PHASE10_TESTING_PERFORMANCE.md # Accepted empirical performance report
└── package.json              # Monorepo scripts and workspace configuration
```

---

## Quick Start & Setup

### 1. Prerequisites
- **Node.js:** `v18.0.0` or higher (Tested on `v22.19.0`)
- **npm:** `v9.0.0` or higher
- **MongoDB:** Running locally on port `27017`

### 2. Installation
```bash
npm run install:all
```

### 3. Environment Setup
```bash
cp backend/.env.example backend/.env
cp udp-server/.env.example udp-server/.env
cp frontend/.env.example frontend/.env
```

### 4. Running the Complete System (Single-Laptop Local Demo)
Open four separate terminal windows to launch the four concurrent processes:

```bash
# Terminal 1: Backend Control Plane API (Port 5000)
npm run dev:backend

# Terminal 2: UDP Media Server (Port 5001)
npm run dev:udp

# Terminal 3: Audio Companion Bridge (Port 5002)
npm run dev:bridge

# Terminal 4: Frontend Web App (Port 5174)
npm run dev:frontend
```

Visit **`http://localhost:5174`** in your browser.

To demo multi-user audio on a single machine:
1. Open Browser 1 (Chrome): Navigate to `http://localhost:5174`, log in as Student 1, create a room `CVH-XXXXXX`, and click **"Connect Audio"**.
2. Open Browser 2 (Firefox or Chrome Incognito): Navigate to `http://localhost:5174`, log in as Student 2, join room `CVH-XXXXXX`, and click **"Connect Audio"**.
3. Both browser sessions communicate with the single local bridge on `ws://127.0.0.1:5002`, which multiplexes separate client UDP sessions to `127.0.0.1:5001`.

---

### 5. Two-Physical-Laptop LAN Testing (Host Laptop A + Client Laptop B)

The architecture supports multi-machine deployment across any standard local Wi-Fi or Ethernet LAN.

```
+--------------------------------------------------------------------------------+
|                             WI-FI / LOCAL AREA NETWORK                         |
+--------------------------------------------------------------------------------+
             ^                                              ^
             | (TCP 5000: REST & WS Presence)               |
             | (UDP 5001: Audio & Telemetry Datagrams)      |
             v                                              v
+------------------------------------------+   +------------------------------------------+
|          LAPTOP A (Host Server)          |   |          LAPTOP B (Client Peer)          |
|  LAN IP: e.g., 192.168.1.100             |   |  LAN IP: e.g., 192.168.1.105             |
|                                          |   |                                          |
|  - MongoDB (localhost:27017)             |   |  - Local Audio Bridge (127.0.0.1:5002)   |
|  - Express Backend (:5000, binds 0.0.0.0)|   |  - Web Frontend (:5174, localhost)       |
|  - UDP Server (:5001, binds 0.0.0.0)     |   |  - Chrome Mic / Speaker (Local Soundcard)|
|  - Local Audio Bridge (127.0.0.1:5002)   |   |                                          |
|  - Web Frontend (:5174, localhost)       |   |  Configuration (.env on Laptop B):       |
|  - Chrome Mic / Speaker (Local Soundcard)|   |    VITE_API_BASE_URL=http://<LAPTOP_A>:5000|
|                                          |   |    UDP_SERVER_HOST=<LAPTOP_A_IP>        |
+------------------------------------------+   +------------------------------------------+
```

#### Why the Audio Bridge Stays Local (Port 5002)
The Companion Audio Bridge (`ws://127.0.0.1:5002`) binds strictly to loopback on **both** machines. It is the direct interface between the browser's Web Audio API and the machine's physical soundcard. It captures microphone PCM frames from that specific laptop and outputs received conference audio to that specific laptop's speakers. Only the central Express backend (port 5000) and UDP server (port 5001) are centralized on Laptop A.

#### Step 1: Host Laptop A Setup (Server & User 1)
1. Find Laptop A's LAN IP address:
   ```powershell
   ipconfig   # Look for IPv4 Address on Wi-Fi (e.g., 192.168.1.100)
   ```
2. Configure Windows Defender Firewall on Laptop A to allow inbound traffic:
   - **TCP Port 5000** (Express REST API + WebSocket Control Layer)
   - **UDP Port 5001** (UDP Audio Packet Router)
   - Powershell command (Run as Administrator on Laptop A):
     ```powershell
     New-NetFirewallRule -DisplayName "CSE Voice Hub Backend" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
     New-NetFirewallRule -DisplayName "CSE Voice Hub UDP Server" -Direction Inbound -LocalPort 5001 -Protocol UDP -Action Allow
     ```
3. Start all services on Laptop A:
   ```bash
   npm run dev:backend    # Terminal 1
   npm run dev:udp        # Terminal 2
   npm run dev:bridge     # Terminal 3
   npm run dev:frontend   # Terminal 4
   ```
4. On Laptop A, open browser to `http://localhost:5174`, log in as Student 1, and create a room `CVH-XXXXXX`.

#### Step 2: Client Laptop B Setup (User 2)
1. Clone the project repository onto Laptop B.
2. Ensure Laptop B is connected to the same Wi-Fi network as Laptop A.
3. Configure environment files on Laptop B:
   - In `frontend/.env` (or create `frontend/.env.local`):
     ```env
     VITE_API_BASE_URL=http://<LAPTOP_A_IP>:5000
     ```
   - In `udp-server/.env` (or set environment variable):
     ```env
     UDP_SERVER_HOST=<LAPTOP_A_IP>
     UDP_PORT=5001
     ```
4. Start only the client-side services on Laptop B:
   ```bash
   npm run dev:bridge     # Terminal 1: Laptop B's Companion Audio Bridge
   npm run dev:frontend   # Terminal 2: Laptop B's Frontend Web App
   ```
5. On Laptop B, open browser to **`http://localhost:5174`**:
   - **Microphone Permissions**: Accessing `http://localhost:5174` is recognized as a Secure Context by Chrome/Edge/Firefox, so microphone access is granted immediately without requiring custom browser security flags.
   - Log in as Student 2, enter room code `CVH-XXXXXX`, and click **"Join Room"**.
   - Click **"Connect Audio"** to start real-time two-way voice streaming over UDP.

#### LAN Testing Precautions & Limitations
- **Acoustic Feedback:** If both laptops are tested in the same room close to each other, wear headphones on both laptops to prevent physical microphone-to-speaker feedback squeal.
- **Wi-Fi Router AP Isolation:** On campus or public Wi-Fi networks (e.g. eduroam, guest networks), client isolation / AP isolation may be enabled, blocking direct device-to-device communication. Use a mobile hotspot or private home Wi-Fi router for peer-to-peer testing.
- **Windows Firewall:** If Laptop B cannot connect, ensure the inbound firewall rules on Laptop A are active, or temporarily permit Node.js network access in Windows Security prompts.

---

## Automated Verification Suite (270 / 270 PASS)

The complete codebase is verified through 12 deterministic test suites:

```bash
# Phase 1: Authentication & User Security (28 Checks)
npm run test:auth

# Phase 2: Conference Rooms & Membership (34 Checks)
npm run test:rooms

# Phase 3: UDP Networking Core (19 Checks)
npm run test:phase3

# Phase 4: Real-Time Audio Transport (18 Checks)
npm run test:audio

# Phase 5: Multi-User Audio Conferencing (13 Checks)
npm run test:multiuser

# Phase 6: Real-Time State Synchronization (18 Checks)
npm run test:phase6

# Phase 7: Network Monitoring & Metrics (20 Checks)
npm run test:metrics

# Phase 7: Multi-User E2E Network Telemetry (7 Checks)
npx ts-node udp-server/src/testing/test-phase7-multiuser-telemetry-e2e.ts

# Phase 8: Adaptive UDP & Rate Control (30 Checks)
npm run test:adaptive

# Phase 8: Multi-User E2E Adaptive Control (8 Checks)
npm run test:adaptive:e2e

# Phase 9: Security Hardening & Reliability (31 Checks)
npm run test:phase9

# Phase 10: Empirical Testing & Performance Evaluation (44 Checks)
npm run test:phase10
```

### Full Monorepo Build Verification
```bash
npm run build
```
*Builds backend (`tsc`), UDP server (`tsc`), and frontend (`vite build`) with **0 errors**.*

---

## Empirical Performance Summary (Phase 10 Baseline)

| Operating Condition | Observed Profile | Measured RTT | Jitter | Loss % | Playout Delay | FEC State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal Loopback Baseline** | `ULTRA` (96 kbps) | 0.58 ms (Min) / 2.31 ms (Avg) | 1.2 ms | 0.0% | 20 ms | Inactive |
| **Moderate Congestion** | `CONSTRAINED` (32 kbps) | 160 ms | 32.0 ms | 4.2% | 111 ms | **Active (100% Recovery)** |
| **Severe Congestion** | `CRITICAL` (16 kbps) | 340 ms | 65.0 ms | 9.5% | 200 ms (Clamped) | **Active (100% Recovery)** |
| **Post-Congestion Recovery** | `STANDARD` $\to$ `HIGH` $\to$ `ULTRA` | 15 ms | 1.5 ms | 0.0% | 20 ms | Deactivated |

*For complete test tables and JSON datasets, see [Phase 10 Performance Report](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE10_TESTING_PERFORMANCE.md) and [Benchmark Results JSON](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/performance/phase10_benchmark_results.json).*

---

## Known Scope Limitations

1. **Acoustic Transducers:** Physical microphone capsules and loudspeaker acoustics were not evaluated in automated CI (tests used synthetic sine buffers and Web Audio streams).
2. **Simulated WAN Impairment:** Packet loss, latency, and jitter were injected via software telemetry queues rather than physical hardware network emulators.
3. **Single-Host Prototype:** Current deployment is a single-server architecture; multi-node regional clustering would require an inter-server routing mesh.
4. **Codec Implementation:** The system uses non-linear 8-bit PCM companding rather than an advanced psychoacoustic codec like IETF Opus.

---

## Master Documentation

For detailed architectural diagrams, protocol definitions, research literature, and defense guides, refer to the [Documentation Index](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/INDEX.md):
- [Final System Architecture (`docs/FINAL_ARCHITECTURE.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/FINAL_ARCHITECTURE.md)
- [Definitive UDP Protocol Specification (`docs/UDP_PROTOCOL.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/UDP_PROTOCOL.md)
- [Adaptive UDP Rate Control Specification (`docs/ADAPTIVE_UDP.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/ADAPTIVE_UDP.md)
- [Research Positioning & Prior-Art Review (`docs/RESEARCH_AND_LITERATURE.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/RESEARCH_AND_LITERATURE.md)
- [Reproducibility & Verification Manual (`docs/REPRODUCIBILITY.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/REPRODUCIBILITY.md)
- [Viva & Technical Interview Preparation (`docs/VIVA_PREPARATION.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/VIVA_PREPARATION.md)
- [Final Demonstration Walkthrough (`docs/FINAL_DEMO_FLOW.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/FINAL_DEMO_FLOW.md)
- [Master Technical Summary (`docs/PROJECT_SUMMARY.md`)](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PROJECT_SUMMARY.md)
