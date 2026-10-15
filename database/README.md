# Database Layer Specification & Guidelines

> **Storage Technology**: MongoDB + Mongoose ODM

---

## 1. Role & Scope of Database

MongoDB is dedicated strictly to storing persistent application domain data:
* User credentials and profiles (Phase 1)
* Conference room configurations and ACL permissions (Phase 2)
* Historical conference session logs and aggregate telemetry metrics (Phase 7 - 11)

---

## 2. Non-Storage Rule for Real-Time Media

> [!IMPORTANT]
> **DO NOT STORE REAL-TIME AUDIO PACKETS IN MONGODB.**
> 
> Real-time UDP audio streams require sub-50ms latency. Passing audio bytes through MongoDB disk persistence or network I/O would introduce unacceptable latency, memory exhaustion, and write lock contention. Audio packet routing occurs purely in-memory inside the UDP server process.

---

## 3. Database Connection Configuration & Degraded Mode

* Configuration URI is loaded exclusively via environment variable (`MONGODB_URI`).
* Connection attempts use a 5-second connection timeout (`serverSelectionTimeoutMS: 5000`).
* If MongoDB is unreachable on startup:
  1. The backend logs a clear connection error.
  2. The API continues operating in **Degraded Mode**.
  3. `GET /api/health` reports `status: "degraded"` and `database.status: "disconnected"`.
