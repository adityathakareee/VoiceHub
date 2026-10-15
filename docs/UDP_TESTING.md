# CSE Voice Hub — UDP Testing & Verification Guide (Phase 3)

## Overview

Phase 3 introduces an automated test suite and test harness to verify multi-client UDP socket communication, short-lived token security, room isolation, sequence tracking, heartbeat timeout, and regression safety.

---

## Execution Commands

### 1. Run Phase 3 UDP Core Test Suite
```bash
npx ts-node udp-server/src/testing/test-phase3-udp.ts
```

### 2. Run Phase 0 UDP Ping/Pong Smoke Test
```bash
npm run test:ping-pong
```

### 3. Run Phase 1 Authentication Regression Suite
```bash
npx ts-node backend/src/testing/test-phase1-auth.ts
```

### 4. Run Phase 2 Room Management Regression Suite
```bash
npx ts-node backend/src/testing/test-phase2-rooms.ts
```

---

## Verified Test Scenarios (19/19 PASSED)

| Scenario | Test Description | Status |
| :--- | :--- | :--- |
| **Scenario 1** | Express control plane generates valid UDP session token (`POST /api/rooms/:roomCode/udp-token`) | **PASS** |
| **Scenario 2** | Oversized packet (>1200 bytes) rejected safely by UDP parser | **PASS** |
| **Scenario 3** | Valid token registers session with UDP server and receives `REGISTER_ACK` | **PASS** |
| **Scenario 4** | SECURITY PASS — Tampered UDP session token rejected by token verifier | **PASS** |
| **Scenario 5** | SECURITY PASS — Expired / malformed UDP session token rejected | **PASS** |
| **Scenario 6** | Structured PING receives PONG response and measures real RTT | **PASS** |
| **Scenario 7** | HEARTBEAT sent and `HEARTBEAT_ACK` received, updating `lastSeen` timestamp | **PASS** |
| **Scenario 8** | Inactive session timed out after `UDP_CLIENT_TIMEOUT_MS` and purged from registry | **PASS** |
| **Scenario 9** | 3 concurrent real UDP clients registered successfully in Room A | **PASS** |
| **Scenario 10** | Client A sends DATA packet; Client B and Client C in Room A receive it | **PASS** |
| **Scenario 11** | ROOM ISOLATION PASS — Client D in Room B receives NO packets from Room A | **PASS** |
| **Scenario 12** | SENDER NON-ECHO PASS — Sender Client A does NOT receive its own packet | **PASS** |
| **Scenario 13 & 14** | Duplicate sequence numbers and out-of-order sequence gaps processed by room router | **PASS** |
| **Scenario 15** | Client sends `LEAVE` packet and clears session cleanly | **PASS** |
| **Scenario 16** | DATA packet with invalid `sessionId` rejected with `INVALID_SESSION` error | **PASS** |
| **Scenario 17** | Express control plane rejects UDP token request for closed room (HTTP 409) | **PASS** |
| **Scenario 18** | Express control plane rejects UDP token request for non-member user (HTTP 403) | **PASS** |
| **Scenario 19** | 5 simultaneous real UDP sockets registered and routing concurrently under stress | **PASS** |
| **Scenario 20** | Graceful shutdown closes all test sockets and cleans server registry | **PASS** |
