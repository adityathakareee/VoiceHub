# Phase 4 — UDP Audio Packet Protocol Specification

## Protocol Extension

Phase 4 Audio Media Transport extends the Phase 3 `UdpPacket` protocol without breaking any existing control packet handlers (`REGISTER`, `PING`, `HEARTBEAT`, `LEAVE`).

### DATA Packet Structure for Audio Frames

```json
{
  "version": 1,
  "type": "DATA",
  "sessionId": "udp_sess_a1b2c3d4e5f67890",
  "clientId": "client_usr123",
  "roomCode": "CVH-A1B2C3",
  "sequence": 42,
  "timestamp": 1758911000123,
  "payload": {
    "mediaType": "audio/pcm16",
    "sampleRate": 16000,
    "channels": 1,
    "frameDurationMs": 20,
    "pcm": "<Base64 encoded 640-byte PCM16 array buffer>"
  }
}
```

### Packet Size Budget & Limits

| Component | Size (bytes) |
|---|---|
| Binary PCM16 Audio Frame (20ms @ 16kHz) | 640 bytes |
| Base64 Encoding Overhead (4/3) | ~854 bytes |
| Protocol Header & JSON Metadata | ~110 bytes |
| **Total Datagram Size** | **~964 bytes** |
| **UDP Server Maximum Limit (`UDP_MAX_PACKET_SIZE`)** | **1200 bytes** |

The 964-byte payload fits safely within the 1200-byte UDP datagram cap, avoiding IP fragmentation.

---

## Local Bridge WebSocket Protocol (`ws://127.0.0.1:5002`)

### Client -> Bridge Messages

1. **Start Audio Session**:
   ```json
   {
     "type": "START_SESSION",
     "token": "<UDP_SESSION_TOKEN>",
     "roomCode": "CVH-XXXXXX"
   }
   ```

2. **Audio Frame Outbound**:
   ```json
   {
     "type": "AUDIO_FRAME",
     "pcm": "<Base64 encoded PCM16 bytes>",
     "sequence": 105
   }
   ```

3. **Mute Control**:
   ```json
   {
     "type": "SET_MUTE",
     "muted": true
   }
   ```

4. **Stop Session**:
   ```json
   {
     "type": "STOP_SESSION"
   }
   ```

### Bridge -> Client Messages

1. **Session Status**:
   ```json
   {
     "type": "SESSION_STATUS",
     "status": "REGISTERED", // CONNECTING | REGISTERED | ERROR | CLOSED
     "sessionId": "udp_sess_xxxx",
     "error": null
   }
   ```

2. **Inbound Audio Frame**:
   ```json
   {
     "type": "AUDIO_FRAME",
     "senderSessionId": "udp_sess_yyyy",
     "senderClientId": "client_userB",
     "sequence": 105,
     "timestamp": 1758911000123,
     "pcm": "<Base64 encoded PCM16 bytes>"
   }
   ```
