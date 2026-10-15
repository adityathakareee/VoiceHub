import { UdpPacket, UdpPacketType } from './packet.types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const VALID_BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;
const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-]+$/;
const VALID_PROFILES = ['ULTRA', 'HIGH', 'STANDARD', 'CONSTRAINED', 'CRITICAL'];

export class PacketValidator {
  /**
   * Validates a parsed UdpPacket against protocol semantic rules.
   */
  public static validate(packet: UdpPacket): ValidationResult {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
      return { isValid: false, error: 'Packet object is empty, null, or invalid' };
    }

    if (packet.version !== 1) {
      return { isValid: false, error: `Unsupported protocol version: ${packet.version}. Expected version 1` };
    }

    if (!packet.type || !Object.values(UdpPacketType).includes(packet.type)) {
      return { isValid: false, error: `Invalid or unknown packet type: '${packet.type}'` };
    }

    if (typeof packet.timestamp !== 'number' || !Number.isFinite(packet.timestamp) || isNaN(packet.timestamp) || packet.timestamp <= 0) {
      return { isValid: false, error: 'Packet timestamp must be a positive unix timestamp' };
    }

    // Common identifier checks if present
    if (packet.clientId !== undefined) {
      if (typeof packet.clientId !== 'string' || packet.clientId.length > 64 || !SAFE_IDENTIFIER_REGEX.test(packet.clientId)) {
        return { isValid: false, error: 'Packet clientId contains invalid characters or exceeds 64 characters' };
      }
    }

    if (packet.roomCode !== undefined) {
      if (typeof packet.roomCode !== 'string' || packet.roomCode.length > 32 || !SAFE_IDENTIFIER_REGEX.test(packet.roomCode)) {
        return { isValid: false, error: 'Packet roomCode contains invalid characters or exceeds 32 characters' };
      }
    }

    // Session ID validation helper
    const validateSessionId = (sessId?: string): ValidationResult => {
      if (!sessId || typeof sessId !== 'string' || !sessId.trim()) {
        return { isValid: false, error: 'Packet requires a non-empty sessionId' };
      }
      if (sessId.length > 64 || !SAFE_IDENTIFIER_REGEX.test(sessId)) {
        return { isValid: false, error: 'Packet sessionId contains invalid characters or exceeds 64 characters' };
      }
      return { isValid: true };
    };

    // Type-specific field validations
    switch (packet.type) {
      case UdpPacketType.REGISTER: {
        if (!packet.token || typeof packet.token !== 'string' || !packet.token.trim()) {
          return { isValid: false, error: 'REGISTER packet requires a non-empty token claim' };
        }
        if (packet.token.length > 1024) {
          return { isValid: false, error: 'REGISTER packet token exceeds maximum allowed length (1024 bytes)' };
        }
        if (!packet.roomCode || typeof packet.roomCode !== 'string' || !packet.roomCode.trim()) {
          return { isValid: false, error: 'REGISTER packet requires a roomCode parameter' };
        }
        break;
      }

      case UdpPacketType.DATA: {
        const sessRes = validateSessionId(packet.sessionId);
        if (!sessRes.isValid) return sessRes;

        if (typeof packet.sequence !== 'number' || !Number.isInteger(packet.sequence) || packet.sequence < 0) {
          return { isValid: false, error: 'DATA packet requires a non-negative integer sequence number' };
        }

        if (!packet.payload || typeof packet.payload !== 'object' || Array.isArray(packet.payload)) {
          return { isValid: false, error: 'DATA packet requires a structured payload object' };
        }

        const payload = packet.payload as any;
        if (payload.pcm !== undefined) {
          if (typeof payload.pcm !== 'string' || !payload.pcm.trim() || !VALID_BASE64_REGEX.test(payload.pcm)) {
            return { isValid: false, error: 'DATA packet pcm payload is not a valid Base64 string' };
          }
          if (payload.pcm.length > 4096) {
            return { isValid: false, error: 'DATA packet pcm payload exceeds size limit' };
          }
        }

        if (payload.format !== undefined && payload.format !== 'pcm16' && payload.format !== 'pcm8') {
          return { isValid: false, error: `DATA packet payload format '${payload.format}' is invalid. Expected pcm16 or pcm8` };
        }

        if (payload.mediaType !== undefined && payload.mediaType !== 'audio/pcm16' && payload.mediaType !== 'audio/pcm8') {
          return { isValid: false, error: `DATA packet mediaType '${payload.mediaType}' is unsupported` };
        }

        if (payload.frameDurationMs !== undefined) {
          if (typeof payload.frameDurationMs !== 'number' || !Number.isFinite(payload.frameDurationMs) || payload.frameDurationMs < 5 || payload.frameDurationMs > 200) {
            return { isValid: false, error: `DATA packet frameDurationMs '${payload.frameDurationMs}' out of realistic range (5-200ms)` };
          }
        }

        if (payload.sampleRate !== undefined) {
          if (typeof payload.sampleRate !== 'number' || ![8000, 16000, 24000, 48000].includes(payload.sampleRate)) {
            return { isValid: false, error: `DATA packet sampleRate '${payload.sampleRate}' is unsupported` };
          }
        }

        if (payload.channels !== undefined && payload.channels !== 1 && payload.channels !== 2) {
          return { isValid: false, error: `DATA packet channels '${payload.channels}' must be 1 or 2` };
        }

        // FEC redundant payload validations
        if (payload.redundantSeq !== undefined) {
          if (typeof payload.redundantSeq !== 'number' || !Number.isInteger(payload.redundantSeq) || payload.redundantSeq < 0) {
            return { isValid: false, error: 'DATA packet redundantSeq must be a non-negative integer' };
          }
        }

        if (payload.redundantPcm !== undefined) {
          if (typeof payload.redundantPcm !== 'string' || !payload.redundantPcm.trim() || !VALID_BASE64_REGEX.test(payload.redundantPcm)) {
            return { isValid: false, error: 'DATA packet redundantPcm must be a valid Base64 string' };
          }
        }

        if (payload.redundantFactor !== undefined) {
          if (typeof payload.redundantFactor !== 'number' || !Number.isInteger(payload.redundantFactor) || payload.redundantFactor < 1 || payload.redundantFactor > 16) {
            return { isValid: false, error: 'DATA packet redundantFactor must be an integer between 1 and 16' };
          }
        }

        if (payload.decimateFactor !== undefined) {
          if (typeof payload.decimateFactor !== 'number' || !Number.isInteger(payload.decimateFactor) || payload.decimateFactor < 1 || payload.decimateFactor > 16) {
            return { isValid: false, error: 'DATA packet decimateFactor must be an integer between 1 and 16' };
          }
        }
        break;
      }

      case UdpPacketType.RATE_CONTROL: {
        const sessRes = validateSessionId(packet.sessionId);
        if (!sessRes.isValid) return sessRes;

        const p = packet.payload as any;
        if (p && typeof p === 'object') {
          if (p.profile !== undefined && !VALID_PROFILES.includes(p.profile)) {
            return { isValid: false, error: `RATE_CONTROL profile '${p.profile}' is invalid. Allowed: ${VALID_PROFILES.join(', ')}` };
          }
          if (p.mode !== undefined && p.mode !== 'AUTO' && p.mode !== 'MANUAL') {
            return { isValid: false, error: `RATE_CONTROL mode '${p.mode}' is invalid. Allowed: AUTO, MANUAL` };
          }
          if (p.targetBitrateKbps !== undefined) {
            if (typeof p.targetBitrateKbps !== 'number' || !Number.isFinite(p.targetBitrateKbps) || p.targetBitrateKbps <= 0 || p.targetBitrateKbps > 320) {
              return { isValid: false, error: 'RATE_CONTROL targetBitrateKbps must be a positive number up to 320 kbps' };
            }
          }
        }
        break;
      }

      case UdpPacketType.HEARTBEAT:
      case UdpPacketType.LEAVE:
      case UdpPacketType.METRICS: {
        const sessRes = validateSessionId(packet.sessionId);
        if (!sessRes.isValid) return sessRes;
        break;
      }

      default:
        break;
    }

    return { isValid: true };
  }
}
