import { envConfig } from '../config/env.config';
import { UdpPacket, UdpPacketType } from './packet.types';
import { logger } from '../utils/logger';

export interface ParseResult {
  success: boolean;
  packet?: UdpPacket;
  isLegacyPing?: boolean;
  error?: string;
}

export class PacketParser {
  /**
   * Safely parses an incoming raw Buffer from a UDP socket.
   */
  public static parse(buffer: Buffer): ParseResult {
    // 1. Check empty or oversized datagrams
    if (!buffer || buffer.length === 0) {
      return { success: false, error: 'Empty datagram payload' };
    }

    if (buffer.length > envConfig.UDP_MAX_PACKET_SIZE) {
      const msg = `Packet size (${buffer.length} bytes) exceeds maximum allowed size (${envConfig.UDP_MAX_PACKET_SIZE} bytes)`;
      logger.warn(`[PARSER] ${msg}`);
      return { success: false, error: msg };
    }

    const rawString = buffer.toString('utf-8').trim();
    if (!rawString) {
      return { success: false, error: 'Empty or whitespace datagram representation' };
    }

    // 2. Check for legacy Phase 0 raw "PING"
    if (rawString === 'PING') {
      return {
        success: true,
        isLegacyPing: true,
        packet: {
          version: 1,
          type: UdpPacketType.PING,
          timestamp: Date.now(),
        },
      };
    }

    // 3. Attempt JSON parse
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawString);
    } catch (_err) {
      return {
        success: false,
        error: 'Malformed JSON packet representation',
      };
    }

    if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
      return {
        success: false,
        error: 'Packet content must be a valid non-array JSON object',
      };
    }

    return {
      success: true,
      packet: parsedJson as UdpPacket,
    };
  }
}
