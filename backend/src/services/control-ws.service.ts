import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { verifyToken } from '../utils/jwt';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';
import { User, IUser } from '../models/user.model';
import { Room, RoomStatus } from '../models/room.model';
import { RoomMember, RoomMemberStatus } from '../models/room-member.model';
import { normalizeRoomCode } from '../utils/roomCode';

export interface ParticipantPresenceState {
  userId: string;
  roomCode: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: Date;
  lastPing: number;
}

export interface ConnectedClient {
  ws: WebSocket;
  user: IUser;
  roomCode: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: Date;
  lastPing: number;
}

export class ControlWsService {
  private wss: WebSocketServer | null = null;
  // RoomCode -> Map<userId, ConnectedClient>
  private rooms: Map<string, Map<string, ConnectedClient>> = new Map();
  // Ping interval timer
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public init(server: http.Server): void {
    if (this.wss) {
      logger.warn('[WS-CONTROL] WebSocket server already initialized');
      return;
    }

    this.wss = new WebSocketServer({
      noServer: true,
      path: '/ws/control',
    });

    server.on('upgrade', async (request, socket, head) => {
      try {
        const { pathname } = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (pathname !== '/ws/control') {
          return;
        }

        const authResult = await this.authenticateUpgrade(request);
        if (!authResult) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const { user, roomCode } = authResult;

        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request, user, roomCode);
        });
      } catch (err) {
        logger.error('[WS-CONTROL] Upgrade handler error:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket, _request: http.IncomingMessage, user: IUser, roomCode: string) => {
      this.handleConnection(ws, user, roomCode);
    });

    // Setup heartbeat check every 30s
    this.heartbeatInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    logger.info('[WS-CONTROL] Real-Time Control & Presence WebSocket Layer initialized on /ws/control');
  }

  /**
   * Authenticate upgrade request via cookie or query param
   */
  private async authenticateUpgrade(request: http.IncomingMessage): Promise<{ user: IUser; roomCode: string } | null> {
    try {
      const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const rawRoomCode = parsedUrl.searchParams.get('roomCode');
      let token = parsedUrl.searchParams.get('token');

      // Check cookie if token not in query
      if (!token && request.headers.cookie) {
        const cookies = request.headers.cookie.split(';').map((c) => c.trim());
        const authCookie = cookies.find((c) => c.startsWith(`${envConfig.COOKIE_NAME}=`));
        if (authCookie) {
          token = authCookie.substring(`${envConfig.COOKIE_NAME}=`.length);
        }
      }

      if (!token || !rawRoomCode) {
        logger.warn('[WS-CONTROL] Upgrade rejected: Missing token or roomCode');
        return null;
      }

      const roomCode = normalizeRoomCode(rawRoomCode);
      const decoded = verifyToken(token);

      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        logger.warn(`[WS-CONTROL] Upgrade rejected: User not found or inactive (${decoded.userId})`);
        return null;
      }

      // Invalidate tokens issued prior to password change
      if (user.passwordChangedAt && decoded.passwordChangedAt) {
        if (decoded.passwordChangedAt !== user.passwordChangedAt.getTime()) {
          logger.warn(`[WS-CONTROL] Upgrade rejected: Password changed after token issuance`);
          return null;
        }
      }

      // Check room existence and status
      const room = await Room.findOne({ roomCode });
      if (!room || room.status === RoomStatus.CLOSED) {
        logger.warn(`[WS-CONTROL] Upgrade rejected: Room ${roomCode} not found or closed`);
        return null;
      }

      // Check room active membership
      const member = await RoomMember.findOne({
        room: room._id,
        user: user._id,
        status: RoomMemberStatus.ACTIVE,
      });

      if (!member) {
        logger.warn(`[WS-CONTROL] Upgrade rejected: User ${user.email} is not an active member of room ${roomCode}`);
        return null;
      }

      return { user, roomCode };
    } catch (err) {
      logger.warn(`[WS-CONTROL] Upgrade authentication failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Handle established WebSocket connection
   */
  private handleConnection(ws: WebSocket, user: IUser, roomCode: string): void {
    const userId = user._id.toString();

    let roomMap = this.rooms.get(roomCode);
    if (!roomMap) {
      roomMap = new Map();
      this.rooms.set(roomCode, roomMap);
    }

    // If client had an existing socket in this room, close the old one cleanly
    const existingClient = roomMap.get(userId);
    if (existingClient && existingClient.ws !== ws) {
      try {
        existingClient.ws.close(1000, 'Replaced by new connection');
      } catch (_e) {
        // ignore
      }
    }

    const client: ConnectedClient = {
      ws,
      user,
      roomCode,
      isMuted: false,
      isSpeaking: false,
      joinedAt: new Date(),
      lastPing: Date.now(),
    };

    roomMap.set(userId, client);
    logger.info(`[WS-CONTROL] Participant ${user.email} (${userId}) connected to room ${roomCode} presence`);

    // 1. Send current room presence snapshot (ROOM_SYNC) to the connected client
    const currentParticipants = this.getRoomPresence(roomCode);
    this.send(ws, {
      type: 'ROOM_SYNC',
      roomCode,
      participants: currentParticipants,
      timestamp: Date.now(),
    });

    // 2. Broadcast PARTICIPANT_JOINED to all other participants in the room
    this.broadcastToRoom(
      roomCode,
      {
        type: 'PARTICIPANT_JOINED',
        roomCode,
        participant: {
          userId,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          department: user.department,
          isMuted: client.isMuted,
          isSpeaking: client.isSpeaking,
          joinedAt: client.joinedAt,
        },
        timestamp: Date.now(),
      },
      ws // exclude sender
    );

    // Message event handler
    ws.on('message', (data: Buffer | string) => {
      try {
        const rawStr = typeof data === 'string' ? data : data.toString('utf8');
        const message = JSON.parse(rawStr);
        this.handleMessage(client, message);
      } catch (err) {
        logger.warn(`[WS-CONTROL] Error handling message from user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Close event handler
    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    // Error event handler
    ws.on('error', (err) => {
      logger.warn(`[WS-CONTROL] WebSocket error for user ${userId}: ${err.message}`);
    });
  }

  /**
   * Process incoming client message
   */
  private handleMessage(client: ConnectedClient, message: any): void {
    client.lastPing = Date.now();
    const userId = client.user._id.toString();

    switch (message.type) {
      case 'PING': {
        this.send(client.ws, { type: 'PONG', timestamp: Date.now() });
        break;
      }

      case 'SET_MUTE': {
        const isMuted = Boolean(message.isMuted);
        client.isMuted = isMuted;
        if (isMuted) {
          client.isSpeaking = false; // Muted user cannot be speaking
        }

        logger.debug(`[WS-CONTROL] Participant ${client.user.email} mute state changed: ${isMuted}`);

        // Broadcast mute state change to everyone in the room (including sender confirmation)
        this.broadcastToRoom(client.roomCode, {
          type: 'PARTICIPANT_MUTED',
          roomCode: client.roomCode,
          userId,
          isMuted,
          timestamp: Date.now(),
        });
        break;
      }

      case 'SET_SPEAKING': {
        // If client is muted, speaking must be false
        const isSpeaking = client.isMuted ? false : Boolean(message.isSpeaking);
        if (client.isSpeaking !== isSpeaking) {
          client.isSpeaking = isSpeaking;
          logger.debug(`[WS-CONTROL] Participant ${client.user.email} speaking state: ${isSpeaking}`);

          this.broadcastToRoom(client.roomCode, {
            type: 'PARTICIPANT_SPEAKING',
            roomCode: client.roomCode,
            userId,
            isSpeaking,
            timestamp: Date.now(),
          });
        }
        break;
      }

      default:
        logger.warn(`[WS-CONTROL] Unknown message type '${message.type}' from user ${userId}`);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: ConnectedClient): void {
    const userId = client.user._id.toString();
    const roomMap = this.rooms.get(client.roomCode);

    if (roomMap && roomMap.get(userId)?.ws === client.ws) {
      roomMap.delete(userId);
      logger.info(`[WS-CONTROL] Participant ${client.user.email} disconnected from room ${client.roomCode}`);

      if (roomMap.size === 0) {
        this.rooms.delete(client.roomCode);
      } else {
        // Notify others
        this.broadcastToRoom(client.roomCode, {
          type: 'PARTICIPANT_LEFT',
          roomCode: client.roomCode,
          userId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Send JSON message to a specific WebSocket client
   */
  private send(ws: WebSocket, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Broadcast message to all connected clients in a specific room
   */
  public broadcastToRoom(roomCode: string, payload: any, excludeWs?: WebSocket): void {
    const roomMap = this.rooms.get(normalizeRoomCode(roomCode));
    if (!roomMap) return;

    const data = JSON.stringify(payload);
    roomMap.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN && client.ws !== excludeWs) {
        client.ws.send(data);
      }
    });
  }

  /**
   * Get list of currently connected participants in a room
   */
  public getRoomPresence(rawRoomCode: string): ParticipantPresenceState[] {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const roomMap = this.rooms.get(roomCode);
    if (!roomMap) return [];

    const list: ParticipantPresenceState[] = [];
    roomMap.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        list.push({
          userId: client.user._id.toString(),
          roomCode,
          firstName: client.user.firstName,
          lastName: client.user.lastName,
          role: client.user.role,
          department: client.user.department,
          isMuted: client.isMuted,
          isSpeaking: client.isSpeaking,
          joinedAt: client.joinedAt,
          lastPing: client.lastPing,
        });
      }
    });

    return list;
  }

  /**
   * Called by REST API when participant leaves room explicitly
   */
  public notifyParticipantLeft(rawRoomCode: string, userId: string): void {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const roomMap = this.rooms.get(roomCode);
    if (roomMap) {
      const client = roomMap.get(userId);
      if (client) {
        try {
          client.ws.close(1000, 'Left room via REST API');
        } catch (_e) {
          // ignore
        }
        roomMap.delete(userId);
      }

      this.broadcastToRoom(roomCode, {
        type: 'PARTICIPANT_LEFT',
        roomCode,
        userId,
        timestamp: Date.now(),
      });

      if (roomMap.size === 0) {
        this.rooms.delete(roomCode);
      }
    }
  }

  /**
   * Called by REST API when participant mutes/unmutes via HTTP fallback
   */
  public updateParticipantMute(rawRoomCode: string, userId: string, isMuted: boolean): boolean {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const roomMap = this.rooms.get(roomCode);
    if (roomMap) {
      const client = roomMap.get(userId);
      if (client) {
        client.isMuted = isMuted;
        if (isMuted) client.isSpeaking = false;

        this.broadcastToRoom(roomCode, {
          type: 'PARTICIPANT_MUTED',
          roomCode,
          userId,
          isMuted,
          timestamp: Date.now(),
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Called by REST API when room metadata is updated
   */
  public notifyRoomUpdated(rawRoomCode: string, updatedRoom: any): void {
    const roomCode = normalizeRoomCode(rawRoomCode);
    this.broadcastToRoom(roomCode, {
      type: 'ROOM_UPDATED',
      roomCode,
      room: {
        name: updatedRoom.name,
        description: updatedRoom.description,
        maxParticipants: updatedRoom.maxParticipants,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Called by REST API when room is closed
   */
  public notifyRoomClosed(rawRoomCode: string): void {
    const roomCode = normalizeRoomCode(rawRoomCode);
    this.broadcastToRoom(roomCode, {
      type: 'ROOM_CLOSED',
      roomCode,
      timestamp: Date.now(),
    });

    const roomMap = this.rooms.get(roomCode);
    if (roomMap) {
      roomMap.forEach((client) => {
        try {
          client.ws.close(1000, 'Room closed');
        } catch (_e) {
          // ignore
        }
      });
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Periodic check to cleanup unresponsive sockets
   */
  private cleanupStaleConnections(): void {
    const now = Date.now();
    this.rooms.forEach((roomMap, roomCode) => {
      roomMap.forEach((client, userId) => {
        if (client.ws.readyState !== WebSocket.OPEN || now - client.lastPing > 90000) {
          logger.info(`[WS-CONTROL] Evicting stale presence connection for user ${userId} in room ${roomCode}`);
          try {
            client.ws.terminate();
          } catch (_e) {
            // ignore
          }
          roomMap.delete(userId);
          this.broadcastToRoom(roomCode, {
            type: 'PARTICIPANT_LEFT',
            roomCode,
            userId,
            reason: 'timeout',
            timestamp: now,
          });
        }
      });

      if (roomMap.size === 0) {
        this.rooms.delete(roomCode);
      }
    });
  }

  /**
   * Close server and cleanup on shutdown
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      this.rooms.forEach((roomMap) => {
        roomMap.forEach((client) => {
          try {
            client.ws.close(1001, 'Server shutting down');
          } catch (_e) {
            // ignore
          }
        });
      });
      this.rooms.clear();

      if (this.wss) {
        this.wss.close(() => {
          logger.info('[WS-CONTROL] Control WebSocket server closed cleanly');
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const controlWsService = new ControlWsService();
