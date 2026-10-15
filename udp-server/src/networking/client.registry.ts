import crypto from 'crypto';
import { UdpClientSession } from './packet.types';
import { logger } from '../utils/logger';

export class UdpClientRegistry {
  private sessions: Map<string, UdpClientSession> = new Map();

  /**
   * Generates a unique UDP session ID
   */
  private generateSessionId(): string {
    return `udp_sess_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Registers a new authenticated UDP client session.
   * Invalidates any previous session for the same user & room or endpoint.
   */
  public registerSession(params: {
    userId: string;
    role: string;
    roomCode: string;
    address: string;
    port: number;
    clientId?: string;
  }): UdpClientSession {
    const roomCode = params.roomCode.toUpperCase().trim();
    const endpointKey = `${params.address}:${params.port}`;

    // Clean up any existing session for the same user in this room or same IP:Port endpoint
    for (const [existingId, sess] of this.sessions.entries()) {
      if ((sess.userId === params.userId && sess.roomCode === roomCode) || `${sess.address}:${sess.port}` === endpointKey) {
        logger.info(`[REGISTRY] Invalidating prior session ${existingId} for user ${params.userId} at ${endpointKey}`);
        this.sessions.delete(existingId);
      }
    }

    const sessionId = this.generateSessionId();
    const clientId = params.clientId || `client_${params.userId.slice(-6)}`;
    const now = Date.now();

    const session: UdpClientSession = {
      sessionId,
      clientId,
      userId: params.userId,
      role: params.role,
      roomCode,
      address: params.address,
      port: params.port,
      lastSeen: now,
      lastSequence: 0,
      connectedAt: now,
    };

    this.sessions.set(sessionId, session);
    logger.info(`[REGISTRY] Registered UDP session ${sessionId} for User ${params.userId} in Room ${roomCode} (${endpointKey})`);

    return session;
  }

  public findSessionById(sessionId: string): UdpClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  public findSessionByEndpoint(address: string, port: number): UdpClientSession | undefined {
    for (const sess of this.sessions.values()) {
      if (sess.address === address && sess.port === port) {
        return sess;
      }
    }
    return undefined;
  }

  public findSessionsByRoom(roomCode: string): UdpClientSession[] {
    const normalized = roomCode.toUpperCase().trim();
    const result: UdpClientSession[] = [];
    for (const sess of this.sessions.values()) {
      if (sess.roomCode === normalized) {
        result.push(sess);
      }
    }
    return result;
  }

  public removeSession(sessionId: string): boolean {
    const sess = this.sessions.get(sessionId);
    if (sess) {
      this.sessions.delete(sessionId);
      logger.info(`[REGISTRY] Removed UDP session ${sessionId} (${sess.userId} in ${sess.roomCode})`);
      return true;
    }
    return false;
  }

  public updateLastSeen(sessionId: string, timestamp: number = Date.now()): void {
    const sess = this.sessions.get(sessionId);
    if (sess) {
      sess.lastSeen = timestamp;
    }
  }

  public updateSequence(sessionId: string, sequence: number): { isDuplicate: boolean; isOutOfOrder: boolean } {
    const sess = this.sessions.get(sessionId);
    if (!sess) {
      return { isDuplicate: false, isOutOfOrder: false };
    }

    let isDuplicate = false;
    let isOutOfOrder = false;

    if (sequence === sess.lastSequence) {
      isDuplicate = true;
    } else if (sequence < sess.lastSequence) {
      isOutOfOrder = true;
    } else if (sequence > sess.lastSequence + 1 && sess.lastSequence > 0) {
      isOutOfOrder = true; // Sequence gap
    }

    if (sequence > sess.lastSequence) {
      sess.lastSequence = sequence;
    }

    return { isDuplicate, isOutOfOrder };
  }

  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  public getActiveRoomCount(): number {
    const rooms = new Set<string>();
    for (const sess of this.sessions.values()) {
      rooms.add(sess.roomCode);
    }
    return rooms.size;
  }

  public getAllSessions(): UdpClientSession[] {
    return Array.from(this.sessions.values());
  }

  public clear(): void {
    this.sessions.clear();
    logger.info('[REGISTRY] Cleared all active UDP sessions');
  }
}
