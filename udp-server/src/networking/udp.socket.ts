import dgram, { Socket } from 'dgram';
import { envConfig } from '../config/env.config';
import { PacketParser } from './packet.parser';
import { PacketValidator } from './packet.validator';
import { UdpClientRegistry } from './client.registry';
import { RoomRouter } from './room.router';
import { HeartbeatManager } from './heartbeat.manager';
import { UdpPacket, UdpPacketType, UdpClientSession } from './packet.types';
import { AdaptiveRateController } from './adaptive.controller';
import { verifyUdpToken } from '../security/udp-session-token';
import { logger } from '../utils/logger';

export class UdpSocketService {
  private socket: Socket | null = null;
  public registry: UdpClientRegistry = new UdpClientRegistry();
  public router: RoomRouter = new RoomRouter(this.registry);
  public heartbeatManager: HeartbeatManager = new HeartbeatManager(this.registry);
  private ipRateLimits: Map<string, { windowStart: number; packetCount: number; invalidCount: number }> = new Map();
  private rateLimitCleanTimer: NodeJS.Timeout | null = null;

  public start(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = dgram.createSocket('udp4');
        this.heartbeatManager.start();

        // Cleanup stale rate limit records every 60s
        this.rateLimitCleanTimer = setInterval(() => {
          const now = Date.now();
          for (const [ip, rec] of this.ipRateLimits.entries()) {
            if (now - rec.windowStart > 10000) {
              this.ipRateLimits.delete(ip);
            }
          }
        }, 60000);

        this.socket.on('listening', () => {
          if (this.socket) {
            const address = this.socket.address();
            logger.info(`[UDP SERVER] Listening on ${address.address}:${address.port}`);
          }
          resolve();
        });

        this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
          try {
            this.handleIncomingPacket(msg, rinfo);
          } catch (err: any) {
            logger.error(`[UDP SERVER] Uncaught exception processing datagram from ${rinfo.address}:${rinfo.port}:`, err);
          }
        });

        this.socket.on('error', (err: Error) => {
          logger.error('[UDP SERVER] Socket error occurred:', err);
          reject(err);
        });

        this.socket.on('close', () => {
          logger.info('[UDP SERVER] Socket closed cleanly');
        });

        this.socket.bind(port, host);
      } catch (error) {
        logger.error('[UDP SERVER] Failed to initialize UDP socket:', error);
        reject(error);
      }
    });
  }

  /**
   * Main packet dispatcher for incoming UDP messages
   */
  private handleIncomingPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // 0. Flood protection / Abuse mitigation
    const now = Date.now();
    let ipRec = this.ipRateLimits.get(rinfo.address);
    if (!ipRec || now - ipRec.windowStart > 1000) {
      ipRec = { windowStart: now, packetCount: 1, invalidCount: 0 };
      this.ipRateLimits.set(rinfo.address, ipRec);
    } else {
      ipRec.packetCount++;
    }

    if (ipRec.packetCount > 1500 || ipRec.invalidCount > 60) {
      // Drop excessive flood to prevent CPU exhaustion
      return;
    }

    const parseResult = PacketParser.parse(msg);

    // 1. Handle parsing failure or oversized packets
    if (!parseResult.success) {
      ipRec.invalidCount++;
      this.sendError(rinfo, parseResult.error || 'Invalid packet syntax or size limit exceeded');
      return;
    }

    // 2. Handle Phase 0 Legacy "PING" string
    if (parseResult.isLegacyPing) {
      logger.info(`[UDP SERVER] Received legacy PING from ${rinfo.address}:${rinfo.port}. Responding with PONG.`);
      const responseBuffer = Buffer.from('PONG');
      this.sendRawBuffer(rinfo, responseBuffer);
      return;
    }

    const packet = parseResult.packet!;

    // 2.5 Verify session existence for session-bound packet types
    if (packet.sessionId && [UdpPacketType.DATA, UdpPacketType.RATE_CONTROL, UdpPacketType.HEARTBEAT, UdpPacketType.METRICS, UdpPacketType.LEAVE].includes(packet.type)) {
      const session = this.registry.findSessionById(packet.sessionId);
      if (!session) {
        this.sendError(rinfo, 'INVALID_SESSION: Session not found or expired');
        return;
      }
    }

    // 3. Semantic Validation
    const valResult = PacketValidator.validate(packet);
    if (!valResult.isValid) {
      ipRec.invalidCount++;
      this.sendError(rinfo, valResult.error || 'Packet validation failed');
      return;
    }

    // 4. Packet Type Dispatcher
    switch (packet.type) {
      case UdpPacketType.REGISTER:
        this.handleRegister(packet, rinfo);
        break;

      case UdpPacketType.PING:
        this.handlePing(packet, rinfo);
        break;

      case UdpPacketType.HEARTBEAT:
        this.handleHeartbeat(packet, rinfo);
        break;

      case UdpPacketType.DATA:
        this.handleData(packet, rinfo);
        break;

      case UdpPacketType.LEAVE:
        this.handleLeave(packet, rinfo);
        break;

      case UdpPacketType.METRICS:
        this.handleMetrics(packet, rinfo);
        break;

      case UdpPacketType.RATE_CONTROL:
        this.handleRateControl(packet, rinfo);
        break;

      default:
        this.sendError(rinfo, `Unsupported packet type: ${packet.type}`);
        break;
    }
  }

  /**
   * Process client session registration with short-lived token verification
   */
  private handleRegister(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    try {
      // Cryptographically verify token
      const tokenPayload = verifyUdpToken(packet.token!);

      // Verify roomCode matches token claim
      if (tokenPayload.roomCode.toUpperCase() !== packet.roomCode!.toUpperCase()) {
        this.sendError(rinfo, 'Token roomCode claim does not match requested roomCode');
        return;
      }

      // Create session in registry
      const session = this.registry.registerSession({
        userId: tokenPayload.userId,
        role: tokenPayload.role,
        roomCode: tokenPayload.roomCode,
        address: rinfo.address,
        port: rinfo.port,
        clientId: packet.clientId,
      });

      // Send REGISTER_ACK
      const ackPacket: UdpPacket = {
        version: 1,
        type: UdpPacketType.REGISTER_ACK,
        sessionId: session.sessionId,
        clientId: session.clientId,
        roomCode: session.roomCode,
        timestamp: Date.now(),
      };

      this.sendPacket(rinfo, ackPacket);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Registration authorization failed';
      this.sendError(rinfo, msg);
    }
  }

  /**
   * Process structured PING packet
   */
  private handlePing(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    if (packet.sessionId) {
      this.registry.updateLastSeen(packet.sessionId);
    }

    const pongPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.PONG,
      sessionId: packet.sessionId,
      sequence: packet.sequence,
      timestamp: Date.now(),
      payload: { originalTimestamp: packet.timestamp },
    };

    this.sendPacket(rinfo, pongPacket);
  }

  /**
   * Process HEARTBEAT packet
   */
  private handleHeartbeat(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    const session = this.registry.findSessionById(packet.sessionId!);

    if (!session) {
      this.sendError(rinfo, 'INVALID_SESSION: Session not found or expired');
      return;
    }

    // Verify endpoint
    if (session.address !== rinfo.address || session.port !== rinfo.port) {
      logger.warn(`[UDP SERVER] Endpoint mismatch for session ${session.sessionId}`);
      this.sendError(rinfo, 'INVALID_ENDPOINT: Packet origin does not match registered session endpoint');
      return;
    }

    this.registry.updateLastSeen(session.sessionId);

    const ackPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.HEARTBEAT_ACK,
      sessionId: session.sessionId,
      timestamp: Date.now(),
    };

    this.sendPacket(rinfo, ackPacket);
  }

  /**
   * Process DATA packet and route to room members
   */
  private handleData(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    const session = this.registry.findSessionById(packet.sessionId!);

    if (!session) {
      this.sendError(rinfo, 'INVALID_SESSION: Session not found or expired');
      return;
    }

    // Verify endpoint to prevent session hijacking
    if (session.address !== rinfo.address || session.port !== rinfo.port) {
      logger.warn(`[UDP SERVER] Endpoint mismatch for session ${session.sessionId} from ${rinfo.address}:${rinfo.port}`);
      this.sendError(rinfo, 'INVALID_ENDPOINT: Packet origin does not match registered session endpoint');
      return;
    }

    this.router.routeDataPacket(session, packet, (target: UdpClientSession, buffer: Buffer) => {
      this.sendRawBuffer({ address: target.address, port: target.port }, buffer);
    });
  }

  /**
   * Process explicit LEAVE packet
   */
  private handleLeave(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    const session = this.registry.findSessionById(packet.sessionId!);
    if (session) {
      this.registry.removeSession(session.sessionId);
    }

    const leaveAck: UdpPacket = {
      version: 1,
      type: UdpPacketType.LEAVE,
      sessionId: packet.sessionId,
      timestamp: Date.now(),
    };

    this.sendPacket(rinfo, leaveAck);
  }

  /**
   * Process METRICS query packet
   */
  private handleMetrics(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    const session = this.registry.findSessionById(packet.sessionId || '');
    if (!session) {
      this.sendError(rinfo, 'INVALID_SESSION: Session not found or expired');
      return;
    }

    const telemetry = this.router.getSessionTelemetry(session.sessionId, session.roomCode);

    const metricsPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.METRICS,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      timestamp: Date.now(),
      payload: telemetry,
    };

    this.sendPacket(rinfo, metricsPacket);
  }

  /**
   * Process client RATE_CONTROL request returning authoritative adaptive transmission state
   */
  private handleRateControl(packet: UdpPacket, rinfo: dgram.RemoteInfo): void {
    const session = this.registry.findSessionById(packet.sessionId || '');
    if (!session) {
      this.sendError(rinfo, 'INVALID_SESSION: Session not found or expired');
      return;
    }

    // Verify endpoint to prevent cross-client rate tampering
    if (session.address !== rinfo.address || session.port !== rinfo.port) {
      logger.warn(`[UDP SERVER] Endpoint mismatch for RATE_CONTROL session ${session.sessionId}`);
      this.sendError(rinfo, 'INVALID_ENDPOINT: Packet origin does not match registered session endpoint');
      return;
    }

    const telemetry = this.router.getSessionTelemetry(session.sessionId, session.roomCode);
    const controller = new AdaptiveRateController();
    const adaptiveState = controller.evaluateNetworkTelemetry(telemetry);

    const ratePacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.RATE_CONTROL,
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      timestamp: Date.now(),
      payload: adaptiveState,
    };

    this.sendPacket(rinfo, ratePacket);
  }

  /**
   * Sends a structured ERROR packet to remote endpoint
   */
  private sendError(rinfo: { address: string; port: number }, message: string): void {
    const errorPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.ERROR,
      error: message,
      timestamp: Date.now(),
    };
    this.sendPacket(rinfo, errorPacket);
  }

  /**
   * Helper to send JSON packet
   */
  private sendPacket(rinfo: { address: string; port: number }, packet: UdpPacket): void {
    const jsonStr = JSON.stringify(packet);
    const buffer = Buffer.from(jsonStr, 'utf-8');
    this.sendRawBuffer(rinfo, buffer);
  }

  /**
   * Helper to send raw Buffer
   */
  private sendRawBuffer(rinfo: { address: string; port: number }, buffer: Buffer): void {
    if (!this.socket) return;
    this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address, (err) => {
      if (err) {
        logger.error(`[UDP SERVER] Error sending packet to ${rinfo.address}:${rinfo.port}`, err);
      }
    });
  }

  /**
   * Graceful close
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.rateLimitCleanTimer) {
        clearInterval(this.rateLimitCleanTimer);
        this.rateLimitCleanTimer = null;
      }
      this.ipRateLimits.clear();

      this.heartbeatManager.stop();
      this.registry.clear();

      if (this.socket) {
        logger.info('[UDP SERVER] Closing UDP socket...');
        this.socket.close(() => {
          this.socket = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
