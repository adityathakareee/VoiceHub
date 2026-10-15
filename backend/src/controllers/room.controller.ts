/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { createRoomSchema, updateRoomSchema, roomCodeParamSchema, updateRoomAdaptiveConfigSchema } from '../schemas/room.schema';
import { RoomService } from '../services/room.service';
import { AppError } from '../middleware/error.middleware';
import { controlWsService } from '../services/control-ws.service';

export class RoomController {
  /**
   * POST /api/rooms
   * Create a new conference room
   */
  public static async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const parseResult = createRoomSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 422);
      }

      const room = await RoomService.createRoom(req.user, parseResult.data);
      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        room,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/my
   * Retrieve rooms owned by or joined by authenticated user
   */
  public static async getMyRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const rooms = await RoomService.getMyRooms(req.user._id);
      res.status(200).json({
        success: true,
        rooms,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomCode
   * Get details and participant list for a specific room
   */
  public static async getRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      res.status(200).json({
        success: true,
        room,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/join
   * Join an active conference room
   */
  public static async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const result = await RoomService.joinRoom(paramResult.data.roomCode, req.user);
      res.status(200).json({
        success: true,
        message: result.message,
        alreadyJoined: result.alreadyJoined,
        room: result.room,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/leave
   * Leave a conference room
   */
  public static async leaveRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const result = await RoomService.leaveRoom(paramResult.data.roomCode, req.user);
      controlWsService.notifyParticipantLeft(paramResult.data.roomCode, req.user._id.toString());

      res.status(200).json({
        success: true,
        message: result.message,
        roomCode: result.roomCode,
        participantCount: result.participantCount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/rooms/:roomCode
   * Edit room details (Name, Description, Max Participants)
   */
  public static async updateRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const parseResult = updateRoomSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 422);
      }

      const room = await RoomService.updateRoom(paramResult.data.roomCode, req.user, parseResult.data);
      controlWsService.notifyRoomUpdated(paramResult.data.roomCode, room);

      res.status(200).json({
        success: true,
        message: 'Room updated successfully',
        room,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/rooms/:roomCode/close
   * Close a room
   */
  public static async closeRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const room = await RoomService.closeRoom(paramResult.data.roomCode, req.user);
      controlWsService.notifyRoomClosed(paramResult.data.roomCode);

      res.status(200).json({
        success: true,
        message: 'Room closed successfully',
        room,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomCode/presence
   * Get real-time connected participant presence and live states
   */
  public static async getRoomPresence(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      // Verify user has access to room and is a member, owner, or admin
      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      if (!room.isJoined && !room.isOwner && req.user.role !== 'ADMIN') {
        throw new AppError('Forbidden. You must be an active participant in this room to view presence.', 403);
      }

      const presenceList = controlWsService.getRoomPresence(paramResult.data.roomCode);
      res.status(200).json({
        success: true,
        roomCode: paramResult.data.roomCode,
        connectedCount: presenceList.length,
        presence: presenceList,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/state
   * Update participant state (e.g. mute) via REST fallback
   */
  public static async updateParticipantState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      // Verify user is an active participant or owner in the room
      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      if (!room.isJoined && !room.isOwner && req.user.role !== 'ADMIN') {
        throw new AppError('Forbidden. You must be an active participant in this room to update state.', 403);
      }

      const { isMuted } = req.body;
      if (typeof isMuted === 'boolean') {
        controlWsService.updateParticipantMute(
          paramResult.data.roomCode,
          req.user._id.toString(),
          isMuted
        );
      }

      res.status(200).json({
        success: true,
        message: 'Participant state updated',
        isMuted,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/udp-token
   * Issue a short-lived UDP session authorization token
   */
  public static async getUdpToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const data = await RoomService.generateUdpToken(paramResult.data.roomCode, req.user);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomCode/metrics
   * Phase 7 — Real-Time Room Telemetry & Network Monitoring
   */
  public static async getRoomMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      // Verify user is an active participant or owner in the room
      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      if (!room.isJoined && !room.isOwner && req.user.role !== 'ADMIN') {
        throw new AppError('Forbidden. You must be an active member of this room to view metrics.', 403);
      }

      const presence = controlWsService.getRoomPresence(paramResult.data.roomCode);
      const mutedCount = presence.filter((p) => p.isMuted).length;
      const speakingCount = presence.filter((p) => p.isSpeaking).length;
      const createdAtTime = room.createdAt ? new Date(room.createdAt).getTime() : Date.now();
      const uptimeSeconds = Math.max(0, Math.floor((Date.now() - createdAtTime) / 1000));

      res.status(200).json({
        success: true,
        metrics: {
          roomCode: paramResult.data.roomCode,
          status: room.status,
          participantCount: room.participantCount,
          maxParticipants: room.maxParticipants,
          activeSockets: presence.length,
          mutedCount,
          speakingCount,
          uptimeSeconds,
          controlChannelHealth: room.status === 'ACTIVE' ? 'HEALTHY' : 'CLOSED',
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private static roomAdaptiveConfigs: Map<
    string,
    {
      mode: 'AUTO' | 'MANUAL';
      targetProfile: 'ULTRA' | 'HIGH' | 'STANDARD' | 'CONSTRAINED' | 'CRITICAL';
      fecEnabled: boolean;
      maxBitrateKbps: number;
      lastUpdated: number;
    }
  > = new Map();

  /**
   * GET /api/rooms/:roomCode/adaptive-state
   * Retrieve real-time adaptive transmission configuration and state
   */
  public static async getRoomAdaptiveState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      if (!room.isJoined && !room.isOwner && req.user.role !== 'ADMIN') {
        throw new AppError('Forbidden. You must be an active member of this room to view adaptive state.', 403);
      }

      let config = RoomController.roomAdaptiveConfigs.get(paramResult.data.roomCode);
      if (!config) {
        config = {
          mode: 'AUTO',
          targetProfile: 'STANDARD',
          fecEnabled: true,
          maxBitrateKbps: 96,
          lastUpdated: Date.now(),
        };
        RoomController.roomAdaptiveConfigs.set(paramResult.data.roomCode, config);
      }

      res.status(200).json({
        success: true,
        roomCode: paramResult.data.roomCode,
        adaptiveConfig: config,
        status: room.status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/adaptive-config
   * Update room-level adaptive transmission configuration (Owner or Admin only)
   */
  public static async updateRoomAdaptiveConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const paramResult = roomCodeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        throw new AppError('Invalid room code parameter', 400);
      }

      const room = await RoomService.getRoomByCode(paramResult.data.roomCode, req.user);
      if (!room.isOwner && req.user.role !== 'ADMIN') {
        throw new AppError('Forbidden. Only room owners or administrators can update adaptive configuration.', 403);
      }

      const bodyResult = updateRoomAdaptiveConfigSchema.safeParse(req.body);
      if (!bodyResult.success) {
        throw new AppError(bodyResult.error.errors[0]?.message || 'Invalid adaptive configuration', 400);
      }

      const { mode, targetProfile, fecEnabled, maxBitrateKbps } = bodyResult.data;

      let config = RoomController.roomAdaptiveConfigs.get(paramResult.data.roomCode) || {
        mode: 'AUTO',
        targetProfile: 'STANDARD',
        fecEnabled: true,
        maxBitrateKbps: 96,
        lastUpdated: Date.now(),
      };

      if (mode) {
        config.mode = mode;
      }
      if (targetProfile) {
        config.targetProfile = targetProfile;
      }
      if (typeof fecEnabled === 'boolean') {
        config.fecEnabled = fecEnabled;
      }
      if (typeof maxBitrateKbps === 'number') {
        config.maxBitrateKbps = maxBitrateKbps;
      }
      config.lastUpdated = Date.now();

      RoomController.roomAdaptiveConfigs.set(paramResult.data.roomCode, config);

      res.status(200).json({
        success: true,
        message: 'Room adaptive transmission configuration updated successfully',
        roomCode: paramResult.data.roomCode,
        adaptiveConfig: config,
      });
    } catch (error) {
      next(error);
    }
  }
}


