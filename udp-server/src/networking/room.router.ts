import { UdpClientRegistry } from './client.registry';
import { UdpPacket, UdpPacketType, UdpClientSession, NetworkTelemetry } from './packet.types';
import { UdpMetricsCollector, globalUdpMetricsCollector } from './metrics.collector';
import { logger } from '../utils/logger';

export interface RouteCallback {
  (targetSession: UdpClientSession, packetBuffer: Buffer): void;
}

export class RoomRouter {
  public packetsReceived = 0;
  public packetsForwarded = 0;
  public packetsRejected = 0;
  public duplicatePackets = 0;
  public outOfOrderPackets = 0;
  public metricsCollector: UdpMetricsCollector;

  constructor(private registry: UdpClientRegistry, metricsCollector?: UdpMetricsCollector) {
    this.metricsCollector = metricsCollector || globalUdpMetricsCollector;
  }

  /**
   * Routes an incoming DATA packet to all other active sessions in the same room.
   */
  public routeDataPacket(
    senderSession: UdpClientSession,
    packet: UdpPacket,
    sendCallback: RouteCallback
  ): { forwardedCount: number; isDuplicate: boolean; isOutOfOrder: boolean } {
    this.packetsReceived++;

    // 1. Sequence tracking
    const seqResult = this.registry.updateSequence(senderSession.sessionId, packet.sequence || 0);
    if (seqResult.isDuplicate) {
      this.duplicatePackets++;
      logger.warn(`[ROUTER] Duplicate sequence ${packet.sequence} detected from session ${senderSession.sessionId}`);
    }
    if (seqResult.isOutOfOrder) {
      this.outOfOrderPackets++;
      logger.warn(`[ROUTER] Out-of-order/gap sequence ${packet.sequence} from session ${senderSession.sessionId}`);
    }

    // Update lastSeen
    this.registry.updateLastSeen(senderSession.sessionId, Date.now());

    // 2. Find target sessions in the same room (EXCLUDING sender)
    const roomSessions = this.registry.findSessionsByRoom(senderSession.roomCode);
    const targetSessions = roomSessions.filter((s) => s.sessionId !== senderSession.sessionId);

    if (targetSessions.length === 0) {
      logger.debug(`[ROUTER] No other active participants in Room ${senderSession.roomCode} to route packet.`);
      return { forwardedCount: 0, ...seqResult };
    }

    // 3. Format forwarded packet
    const forwardedPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.DATA,
      sessionId: senderSession.sessionId,
      clientId: senderSession.clientId,
      roomCode: senderSession.roomCode,
      sequence: packet.sequence,
      timestamp: packet.timestamp,
      payload: packet.payload,
    };

    const packetBuffer = Buffer.from(JSON.stringify(forwardedPacket), 'utf-8');

    // Record incoming packet metrics
    this.metricsCollector.recordIncomingPacket({
      sessionId: senderSession.sessionId,
      roomCode: senderSession.roomCode,
      sequence: packet.sequence || 0,
      senderTimestamp: packet.timestamp || Date.now(),
      byteSize: packetBuffer.length,
    });

    let forwardedCount = 0;

    // 4. Dispatch packet to targets
    for (const target of targetSessions) {
      try {
        sendCallback(target, packetBuffer);
        forwardedCount++;
        this.packetsForwarded++;
        this.metricsCollector.recordOutgoingPacket(target.sessionId, target.roomCode, packetBuffer.length);
      } catch (err) {
        logger.error(`[ROUTER] Failed to forward packet to ${target.address}:${target.port}`, err);
      }
    }

    logger.debug(
      `[ROUTER] Forwarded DATA packet (seq=${packet.sequence}) from ${senderSession.sessionId} to ${forwardedCount} clients in Room ${senderSession.roomCode}`
    );

    return { forwardedCount, ...seqResult };
  }

  public getSessionTelemetry(sessionId: string, roomCode: string): NetworkTelemetry {
    return this.metricsCollector.getTelemetry(sessionId, roomCode);
  }

  public getStats() {
    return {
      packetsReceived: this.packetsReceived,
      packetsForwarded: this.packetsForwarded,
      packetsRejected: this.packetsRejected,
      duplicatePackets: this.duplicatePackets,
      outOfOrderPackets: this.outOfOrderPackets,
    };
  }

  public resetStats(): void {
    this.packetsReceived = 0;
    this.packetsForwarded = 0;
    this.packetsRejected = 0;
    this.duplicatePackets = 0;
    this.outOfOrderPackets = 0;
  }
}
