# Conference Room & Management API Specification — Phase 2

## Overview

The Conference Room Management API provides RESTful endpoints for authenticated users to create, discover, join, leave, update, and close real MongoDB-backed conference rooms in **CSE Voice Hub**.

All endpoints require cryptographic session authentication via HttpOnly JWT cookies (`requireAuth`). Identity (`req.user`) is strictly derived server-side.

---

## Base Path

```text
/api/rooms
```

---

## Authorization Matrix

| Endpoint | Method | Role / Permission Required | Description |
| :--- | :--- | :--- | :--- |
| `POST /api/rooms` | `POST` | Authenticated User (`STUDENT`, `FACULTY`, `ADMIN`) | Creates a new conference room and automatically joins creator as owner/active member. |
| `GET /api/rooms/my` | `GET` | Authenticated User | Lists all rooms owned or joined by the requesting user. |
| `GET /api/rooms/:roomCode` | `GET` | Authenticated User | Retrieves room metadata. Participant list exposed only to members, owner, or ADMIN. |
| `POST /api/rooms/:roomCode/join` | `POST` | Authenticated User | Joins an active room by room code. Enforces max capacity & prevents duplicate active memberships. |
| `POST /api/rooms/:roomCode/leave` | `POST` | Authenticated User | Leaves an active room session. Transitions member status to `LEFT`. |
| `PATCH /api/rooms/:roomCode` | `PATCH` | Room Owner or `ADMIN` | Updates room details (`name`, `description`, `maxParticipants`). |
| `PATCH /api/rooms/:roomCode/close` | `PATCH` | Room Owner or `ADMIN` | Closes room (`CLOSED`), setting `closedAt` timestamp and transitioning members to `LEFT`. |

---

## Endpoint Details

### 1. Create Conference Room

**`POST /api/rooms`**

Creates a new conference room. Generates a unique 6-character room code (`CVH-XXXXXX`) using a cryptographically secure random source. The creator automatically becomes an active member (`participantCount = 1`).

#### Request Body
```json
{
  "name": "Computer Networks Discussion",
  "description": "CNT project team discussion on adaptive UDP protocol",
  "maxParticipants": 10
}
```

#### Field Constraints
- `name`: Required, 2–100 characters.
- `description`: Optional, max 500 characters.
- `maxParticipants`: Optional integer between 2 and 50 (default: 10).

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Room created successfully",
  "room": {
    "id": "66f1e8a90123456789abcdef",
    "roomCode": "CVH-7K4P2M",
    "name": "Computer Networks Discussion",
    "description": "CNT project team discussion on adaptive UDP protocol",
    "owner": {
      "id": "66f1e8000123456789abcde0",
      "firstName": "Aditya",
      "lastName": "Thakare",
      "role": "STUDENT",
      "department": "Computer Engineering"
    },
    "status": "ACTIVE",
    "maxParticipants": 10,
    "participantCount": 1,
    "createdAt": "2026-09-23T15:20:00.000Z"
  }
}
```

---

### 2. Get My Rooms

**`GET /api/rooms/my`**

Retrieves a list of rooms owned by or currently joined by the authenticated user.

#### Response (`200 OK`)
```json
{
  "success": true,
  "rooms": [
    {
      "id": "66f1e8a90123456789abcdef",
      "roomCode": "CVH-7K4P2M",
      "name": "Computer Networks Discussion",
      "description": "CNT project team discussion on adaptive UDP protocol",
      "owner": {
        "id": "66f1e8000123456789abcde0",
        "firstName": "Aditya",
        "lastName": "Thakare",
        "role": "STUDENT",
        "department": "Computer Engineering"
      },
      "status": "ACTIVE",
      "maxParticipants": 10,
      "participantCount": 2,
      "createdAt": "2026-09-23T15:20:00.000Z",
      "isOwner": true
    }
  ]
}
```

---

### 3. Get Room Details

**`GET /api/rooms/:roomCode`**

Retrieves details for a specific room. Room codes are case-normalized automatically.

#### Path Parameters
- `roomCode`: string (e.g. `CVH-7K4P2M` or `cvh-7k4p2m`).

#### Response (`200 OK`)
```json
{
  "success": true,
  "room": {
    "id": "66f1e8a90123456789abcdef",
    "roomCode": "CVH-7K4P2M",
    "name": "Computer Networks Discussion",
    "description": "CNT project team discussion on adaptive UDP protocol",
    "owner": {
      "id": "66f1e8000123456789abcde0",
      "firstName": "Aditya",
      "lastName": "Thakare",
      "role": "STUDENT",
      "department": "Computer Engineering"
    },
    "status": "ACTIVE",
    "maxParticipants": 10,
    "participantCount": 2,
    "participants": [
      {
        "id": "66f1e8000123456789abcde0",
        "firstName": "Aditya",
        "lastName": "Thakare",
        "role": "STUDENT",
        "joinedAt": "2026-09-23T15:20:00.000Z"
      },
      {
        "id": "66f1e8110123456789abcde1",
        "firstName": "Rahul",
        "lastName": "Patil",
        "role": "STUDENT",
        "joinedAt": "2026-09-23T15:22:00.000Z"
      }
    ],
    "isOwner": true,
    "isJoined": true,
    "createdAt": "2026-09-23T15:20:00.000Z"
  }
}
```

---

### 4. Join Conference Room

**`POST /api/rooms/:roomCode/join`**

Joins an active conference room.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Joined room successfully",
  "alreadyJoined": false,
  "room": {
    "id": "66f1e8a90123456789abcdef",
    "roomCode": "CVH-7K4P2M",
    "name": "Computer Networks Discussion",
    "status": "ACTIVE",
    "maxParticipants": 10,
    "participantCount": 2
  }
}
```

#### Error Responses
- `404 Not Found`: Room code does not exist.
- `409 Conflict`: Room is full (`maxParticipants` reached) or room is `CLOSED`.

---

### 5. Leave Conference Room

**`POST /api/rooms/:roomCode/leave`**

Leaves an active conference room session.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Left room successfully",
  "roomCode": "CVH-7K4P2M",
  "participantCount": 1
}
```

---

### 6. Update Room Details

**`PATCH /api/rooms/:roomCode`**

Updates room details. Only room owner or `ADMIN` authorized.

#### Request Body
```json
{
  "name": "Updated Discussion Title",
  "description": "Updated description",
  "maxParticipants": 15
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Room updated successfully",
  "room": {
    "id": "66f1e8a90123456789abcdef",
    "roomCode": "CVH-7K4P2M",
    "name": "Updated Discussion Title",
    "description": "Updated description",
    "status": "ACTIVE",
    "maxParticipants": 15,
    "participantCount": 1
  }
}
```

---

### 7. Close Conference Room

**`PATCH /api/rooms/:roomCode/close`**

Closes a room session. Only room owner or `ADMIN` authorized. Transitions all active memberships to `LEFT`.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Room closed successfully",
  "room": {
    "id": "66f1e8a90123456789abcdef",
    "roomCode": "CVH-7K4P2M",
    "name": "Computer Networks Discussion",
    "status": "CLOSED",
    "closedAt": "2026-09-23T15:30:00.000Z",
    "participantCount": 0
  }
}
```
