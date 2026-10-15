# CSE VOICE HUB — REPRODUCIBILITY GUIDE & VERIFICATION MANUAL

## 1. System Requirements & Prerequisites
- **Node.js:** `v18.0.0` or higher (Tested on `v22.19.0` x64)
- **Package Manager:** `npm` v9.0.0+
- **Database Engine:** MongoDB v5.0+ running locally on port `27017` (or MongoDB Atlas URI)
- **Supported Operating Systems:** Windows 10/11, Linux (Ubuntu/Debian), macOS

---

## 2. Clean Installation & Setup

### Step 1: Install All Monorepo Dependencies
From the repository root directory, run:
```bash
npm run install:all
```
*This command executes root, backend, udp-server, and frontend dependency installations in sequence.*

### Step 2: Environment Configuration
Copy the provided `.env.example` templates to `.env`:
```bash
# Backend Environment
cp backend/.env.example backend/.env

# UDP Server Environment
cp udp-server/.env.example udp-server/.env

# Frontend Environment
cp frontend/.env.example frontend/.env
```

Ensure MongoDB is running locally:
```bash
mongod --dbpath <path_to_db>
```

---

## 3. Running Services in Development Mode

To run the complete interactive platform, start four terminal processes:

| Service | Command | Port / Host | Description |
| :--- | :--- | :--- | :--- |
| **Backend API** | `npm run dev:backend` | `http://localhost:5000` | Express REST API & WebSocket Presence |
| **UDP Media Server** | `npm run dev:udp` | `127.0.0.1:5001` | Connectionless UDP Media Router & Policy Engine |
| **Companion Bridge** | `npm run dev:bridge` | `ws://127.0.0.1:5002` | Local WebSocket-to-UDP Audio Relayer & Codec |
| **Frontend Web App** | `npm run dev:frontend`| `http://localhost:5173` | React 18 / Vite Single Page Application |

---

## 4. Running the Automated Verification Suite (270 / 270 Checks)

All 270 automated checks across Phases 1 through 10 can be executed independently using the commands below:

### Phase 1: Authentication & User Security (28 Checks)
```bash
npm --prefix backend run test:auth
```
*Verifies JWT HttpOnly cookies, bcrypt hashing, role enforcement, profile updates, and password invalidation.*

### Phase 2: Conference Rooms & Membership (34 Checks)
```bash
npm --prefix backend run test:rooms
```
*Verifies unique room code generation, capacity limits, role authorization, and join/leave/close lifecycles.*

### Phase 3: UDP Networking Core (19 Checks)
```bash
npm --prefix udp-server run test:phase3
```
*Verifies UDP token validation, PING/PONG RTT, heartbeat timeout, MTU checks, and room routing isolation.*

### Phase 4: Real-Time Audio Transport (18 Checks)
```bash
npm run test:audio
```
*Verifies 16kHz PCM16 framing, Companion Bridge WebSocket-to-UDP relay, non-echo forwarding, and mute suppression.*

### Phase 5: Multi-User Audio Conferencing (13 Checks)
```bash
npm run test:multiuser
```
*Verifies multi-stream mixing, per-sender audio nodes, dynamic headroom scaling ($1/\sqrt{N}$), and duplicate sequence rejection.*

### Phase 6: Real-Time State Synchronization (18 Checks)
```bash
npm run test:phase6
```
*Verifies WebSocket presence sync, instant mute broadcast, speaking status suppression, and REST state fallback.*

### Phase 7: Network Monitoring & Telemetry (27 Checks Total)
```bash
npm run test:phase7
```
*Runs unit checks on RFC 3550 jitter calculation, packet loss estimation, quality classification, and metrics REST endpoints (20 checks).*

```bash
npx ts-node udp-server/src/testing/test-phase7-multiuser-telemetry-e2e.ts
```
*Runs multi-user end-to-end network telemetry audit with audio flow validation (7 checks).*

### Phase 8: Adaptive UDP & Rate Control (38 Checks Total)
```bash
npm run test:phase8
```
*Runs AIMD rate adaptation, 5-profile state transitions, RFC 3550 playout buffer calculation, and FEC companding checks (30 checks).*

```bash
npm run test:phase8:e2e
```
*Runs multi-user end-to-end adaptive rate control verification under realistic payload conditions (8 checks).*

### Phase 9: Security & Reliability Hardening (31 Checks)
```bash
npm run test:phase9
```
*Verifies malformed datagram rejection, endpoint IP/port anti-spoofing, stale session cleanup, and crash resilience under barrage.*

### Phase 10: Testing & Performance Evaluation (44 Checks)
```bash
npm run test:phase10
```
*Executes all 12 empirical experiments: baseline RTT, loss degradation, latency/jitter buffer scaling, combined stress, FEC recovery, adaptive vs. static benchmark, multi-user scalability, and anti-oscillation deadband.*

---

## 5. Production Monorepo Build Verification
To verify that all TypeScript code across the monorepo compiles with zero errors and that Vite generates the production client bundle:
```bash
npm run build
```

Expected Output:
```text
> cse-voice-hub-monorepo@0.1.0 build
> npm run build:backend && npm run build:udp && npm run build:frontend

[backend]  tsc -> 0 errors
[udp-server] tsc -> 0 errors
[frontend] tsc && vite build -> 0 errors (built in ~2-4s)
```
