# Backend Mongoose Data Models Strategy

> **Phase 0 Notice**: Data models are intentionally NOT created in Phase 0 to maintain clean architectural boundaries and avoid premature schema declarations.

## Planned Schema Taxonomy for Future Phases

When business requirements are implemented in Phase 1+, schemas will follow Mongoose best practices:

1. **`User.ts` (Phase 1)**:
   - `username`: string (unique, indexed)
   - `email`: string (unique, indexed)
   - `passwordHash`: string (bcrypt hashed)
   - `role`: enum (`'student'`, `'faculty'`, `'admin'`)

2. **`Room.ts` (Phase 2)**:
   - `roomName`: string (unique slug)
   - `createdById`: ObjectId (ref: `User`)
   - `maxParticipants`: number
   - `isEncrypted`: boolean

3. **`SessionLog.ts` (Phase 7)**:
   - `roomId`: ObjectId (ref: `Room`)
   - `avgLatencyMs`: number
   - `packetLossPercent`: number
   - `avgJitterMs`: number

> **IMPORTANT RULE**: Audio payload data packets MUST NEVER BE STORED in MongoDB. UDP audio streams bypass database persistence and pass exclusively through memory/UDP socket buffers.
