# Getting Started — CSE Voice Hub (Phase 0)

This guide details step-by-step setup instructions for developing and running CSE Voice Hub locally.

---

## 1. Environment Setup

### 1.1 Prerequisites
Ensure the following tools are installed on your workstation:
* **Node.js**: v18.0.0+ (`node -v`)
* **npm**: v9.0.0+ (`npm -v`)
* **MongoDB**: Community Edition v6.0+ (optional for degraded startup mode)

### 1.2 Installation
Run the root monorepo installer:
```bash
npm run install:all
```

---

## 2. Configuration Setup

Copy the template `.env.example` files into active `.env` files for each service:

```bash
# Root
cp .env.example .env

# Backend
cp backend/.env.example backend/.env

# UDP Server
cp udp-server/.env.example udp-server/.env

# Frontend
cp frontend/.env.example frontend/.env
```

---

## 3. Execution Commands

### 3.1 Backend API Server
```bash
npm run dev:backend
```
* Server binds to: `http://localhost:5000`
* Health Check: `http://localhost:5000/api/health`

### 3.2 Standalone UDP Server
```bash
npm run dev:udp
```
* UDP socket binds to: `0.0.0.0:5001`

### 3.3 UDP Ping/Pong Smoke Test
In a separate terminal while the UDP server is running:
```bash
npm run test:udp
```

### 3.4 Web Frontend Dashboard
```bash
npm run dev:frontend
```
* Access UI at: `http://localhost:5174`

---

## 4. Automated Testing Suites

### 4.1 Phase 2 Conference Room API & Database Test Suite
Runs 34 automated scenarios covering room creation, room code formatting, active membership, user joining, capacity limits, non-owner authorization checks, room closing, partial unique database index verification, and invalid room codes:
```bash
npx ts-node backend/src/testing/test-phase2-rooms.ts
```

### 4.2 Phase 1 Security & Authentication Test Suite
Runs 28 automated security scenarios covering JWT cookie authentication, password hashing, role protection, profile updates, and session invalidation:
```bash
npx ts-node backend/src/testing/test-phase1-auth.ts
```

### 4.3 Phase 0 UDP Ping/Pong Smoke Test
```bash
npm run test:udp
```

---

## 5. Build & Compilation Verification
To execute TypeScript typechecks and generate production dist bundles across all workspace packages:
```bash
npm run build
```

