# CSE VOICE HUB — FINAL DEMONSTRATION SCRIPT & WALKTHROUGH

## 1. Demonstration Overview
This document outlines the step-by-step demonstration procedure for presentation, viva, and technical evaluation of the **CSE Voice Hub**. 

> [!IMPORTANT]
> **Methodology Distinction**: 
> - **LIVE DEMONSTRATION:** Real-time web browser UI, user authentication, room membership, WebSocket presence synchronization, and audio loopback routing.
> - **SIMULATED EXPERIMENT:** Controlled injection of packet loss and latency in the telemetry channel to demonstrate the mathematical AIMD transitions and buffer adaptations of the rate controller.

---

## 2. Live Demonstration Flow (Phase-by-Phase)

### Step 1: User Authentication & Role Enforcement (Phases 1 & 9)
1. Open a browser window navigating to `http://localhost:5174`.
2. Register a new user:
   - Email: `alice@cse.edu`, Password: `Password@123`, Name: `Alice Walker`, Role: `STUDENT`.
3. Inspect Browser DevTools $\to$ Application $\to$ Cookies:
   - Observe the `cse_voice_hub_auth` cookie set with `HttpOnly` and `SameSite=Strict`.
4. Log out and log in with an administrator account (`admin@cse.edu`).
5. Demonstrate role-based UI capabilities on the dashboard.

### Step 2: Conference Room Creation & Privacy (Phase 2)
1. In Alice's session, click **Create Room**.
2. Name the room: `"Computer Networks Lab Conference"`, Capacity: `5`.
3. The system generates a formatted room code (e.g., `CVH-LAB501`).
4. Alice is automatically assigned room ownership.
5. In a second Incognito browser window, log in as `bob@cse.edu` and enter the code `CVH-LAB501` to join.

### Step 3: Real-Time Presence & State Synchronization (Phase 6)
1. Arrange the two browser windows side-by-side.
2. In Alice's window, toggle **Mute**:
   - Observe instantaneous mute icon update in Bob's window over the WebSocket channel (`/ws/control`).
3. Toggle Bob's microphone to demonstrate speaking indicator synchronization.
4. Alice edits room metadata: title updates in real time on Bob's screen without a page refresh.

### Step 4: Real-Time Audio Transport & Companion Bridge (Phases 3, 4, 5)
1. In both windows, click **Connect Audio**.
2. The browser connects to the local Companion Bridge (`ws://127.0.0.1:5002`), which completes the HMAC token handshake with the UDP Media Server (`127.0.0.1:5001`).
3. Inspect terminal logs:
   - `[REGISTRY] Registered UDP session udp_sess_... for User Alice in Room CVH-LAB501`
   - `[ROUTER] Forwarded DATA packet from udp_sess_... to 1 clients in Room CVH-LAB501`
4. Demonstrate sender non-echo: Alice's audio stream is forwarded exclusively to Bob; Alice hears no delayed copy of her own voice.

### Step 5: Network Monitoring & Telemetry HUD (Phase 7)
1. Expand the **Telemetry HUD** panel on the UI.
2. Inspect live metrics:
   - **RTT:** `1 – 3 ms` (Local loopback)
   - **RFC 3550 Jitter:** `< 1.0 ms`
   - **Packet Loss:** `0.00 %`
   - **Quality State:** `EXCELLENT`
   - **Bitrate:** Rolling uplink and downlink bitrate counters.

### Step 6: Adaptive Rate Control & Network Degradation Demonstration (Phases 8 & 10)
1. Expand the **Adaptive Rate Control HUD**.
2. Note the initial baseline profile: **`ULTRA`** (96 kbps, 15ms frame, 240 samples), FEC `INACTIVE`, Playout Delay `20 ms`.
3. **Simulate Network Impairment (Telemetry Injection via CLI/Test Harness):**
   - Inject moderate congestion (3.5% loss, 160ms RTT, 25ms jitter).
   - Observe real-time downshift: Profile drops to **`CONSTRAINED`** (32 kbps).
   - Observe FEC status: **`ACTIVE`** (indicator illuminates red/amber).
   - Observe Playout Buffer delay: Automatically scales from `20 ms` to `111 ms`.
4. **Simulate Severe Degradation:**
   - Inject severe congestion (8.5% loss, 320ms RTT).
   - Observe Multiplicative Decrease: Profile drops to **`CRITICAL`** (16 kbps, 40ms frame).
   - Playout Buffer reaches safe maximum clamp: `200 ms`.
5. **Simulate Network Recovery:**
   - Restore pristine telemetry (0% loss, 15ms RTT).
   - Observe 3-step additive increase hysteresis:
     - Cycle 1: Steps up to **`STANDARD`** (64 kbps, FEC deactivates).
     - Cycle 2: Steps up to **`HIGH`** (80 kbps).
     - Cycle 3: Sustained pristine connection restores **`ULTRA`** (96 kbps).

### Step 7: Multi-User Conferencing & Room Isolation (Phases 3, 5, 9)
1. Join a third user (`carol@cse.edu`) into `CVH-LAB501`:
   - Active streams indicator updates to 3.
   - Master gain dynamic headroom attenuates automatically by factor $1/\sqrt{3}$ to prevent digital audio clipping.
2. Open a separate room (`CVH-ISOLAT`) with user `dave@cse.edu`:
   - Verify room isolation: Dave receives 0 packets from `CVH-LAB501`.

### Step 8: Security & Reconnection Verification (Phase 9)
1. Terminate Bob's browser tab abruptly:
   - Alice's presence list updates to show Bob left.
   - The UDP media server reclaims Bob's session upon heartbeat expiration.
2. Reconnect Bob:
   - A fresh session token is minted; stale prior sessions are invalidated immediately.

---

## 3. Reviewing Automated Benchmarks & Empirical Proof
Direct evaluators to the generated Phase 10 artifacts:
1. Show [`docs/performance/phase10_benchmark_results.json`](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/performance/phase10_benchmark_results.json) containing all 12 empirical benchmark results.
2. Highlight the 100% loss recovery rate of the companded FEC mechanism under 1200-byte wire MTU constraints.
3. Show [`docs/PHASE10_TESTING_PERFORMANCE.md`](file:///c:/Users/thaka/OneDrive/Desktop/VIT/SEM5/CNT/CourseProject/docs/PHASE10_TESTING_PERFORMANCE.md) with comprehensive data tables and technical limitations.
