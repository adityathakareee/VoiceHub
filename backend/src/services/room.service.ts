import mongoose from 'mongoose';
import { Room, IRoom, RoomStatus } from '../models/room.model';
import { RoomMember, IRoomMember, RoomMemberStatus } from '../models/room-member.model';
import { IUser, UserRole } from '../models/user.model';
import { generateRoomCode, normalizeRoomCode } from '../utils/roomCode';
import { signUdpSessionToken } from '../utils/jwt';
import { CreateRoomDTO, UpdateRoomDTO } from '../schemas/room.schema';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class RoomService {
  /**
   * Formats safe owner output object
   */
  private static formatSafeOwner(owner: any) {
    if (!owner) return null;
    return {
      id: owner._id ? owner._id.toString() : owner.toString(),
      firstName: owner.firstName || '',
      lastName: owner.lastName || '',
      role: owner.role || '',
      department: owner.department || '',
    };
  }

  /**
   * Formats safe participant output object
   */
  private static formatSafeParticipant(memberDoc: any) {
    const user = memberDoc.user;
    if (!user) return null;
    return {
      id: user._id ? user._id.toString() : user.toString(),
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: user.role || '',
      joinedAt: memberDoc.joinedAt,
    };
  }

  /**
   * Create a new conference room and automatically make owner an active participant.
   */
  public static async createRoom(ownerUser: IUser, data: CreateRoomDTO) {
    let roomCode = generateRoomCode();
    let collisionAttempts = 0;
    const MAX_COLLISION_ATTEMPTS = 5;

    while (collisionAttempts < MAX_COLLISION_ATTEMPTS) {
      const existing = await Room.findOne({ roomCode });
      if (!existing) {
        break;
      }
      collisionAttempts++;
      logger.warn(`Room code collision detected for ${roomCode}. Retrying attempt ${collisionAttempts}...`);
      roomCode = generateRoomCode();
    }

    if (collisionAttempts >= MAX_COLLISION_ATTEMPTS) {
      throw new AppError('Failed to generate a unique room code. Please try again.', 500);
    }

    let room: IRoom;
    try {
      room = await Room.create({
        roomCode,
        name: data.name,
        description: data.description || '',
        owner: ownerUser._id,
        status: RoomStatus.ACTIVE,
        maxParticipants: data.maxParticipants || 10,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError('Room code collision error. Please try again.', 409);
      }
      throw err;
    }

    // Automatically join the owner as an active member
    await RoomMember.create({
      room: room._id,
      user: ownerUser._id,
      status: RoomMemberStatus.ACTIVE,
      joinedAt: new Date(),
    });

    logger.info(`Room created: ${room.roomCode} (${room.name}) by Owner: ${ownerUser.email}`);

    return {
      id: room._id.toString(),
      roomCode: room.roomCode,
      name: room.name,
      description: room.description,
      owner: this.formatSafeOwner(ownerUser),
      status: room.status,
      maxParticipants: room.maxParticipants,
      participantCount: 1,
      createdAt: room.createdAt,
    };
  }

  /**
   * Get all rooms relevant to the authenticated user (owned or active participant)
   */
  public static async getMyRooms(userId: mongoose.Types.ObjectId) {
    // 1. Find room IDs where user is an active member
    const activeMemberships = await RoomMember.find({
      user: userId,
      status: RoomMemberStatus.ACTIVE,
    }).select('room');

    const activeRoomIds = activeMemberships.map((m) => m.room);

    // 2. Find rooms owned by user OR where user is active member
    const rooms = await Room.find({
      $or: [{ owner: userId }, { _id: { $in: activeRoomIds } }],
    })
      .populate('owner', 'firstName lastName email role department')
      .sort({ createdAt: -1 });

    // 3. Attach real active participant counts
    const formattedRooms = await Promise.all(
      rooms.map(async (room) => {
        const participantCount = await RoomMember.countDocuments({
          room: room._id,
          status: RoomMemberStatus.ACTIVE,
        });

        return {
          id: room._id.toString(),
          roomCode: room.roomCode,
          name: room.name,
          description: room.description,
          owner: this.formatSafeOwner(room.owner),
          status: room.status,
          maxParticipants: room.maxParticipants,
          participantCount,
          createdAt: room.createdAt,
          isOwner: room.owner && (room.owner as any)._id.toString() === userId.toString(),
        };
      })
    );

    return formattedRooms;
  }

  /**
   * Get room details by room code with participant details (if authorized)
   */
  public static async getRoomByCode(rawRoomCode: string, requestingUser: IUser) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode }).populate('owner', 'firstName lastName email role department');

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    const activeMemberDocs = await RoomMember.find({
      room: room._id,
      status: RoomMemberStatus.ACTIVE,
    }).populate('user', 'firstName lastName email role department');

    const participantCount = activeMemberDocs.length;
    const isOwner = room.owner && (room.owner as any)._id.toString() === requestingUser._id.toString();
    const isMember = activeMemberDocs.some(
      (m) => m.user && (m.user as any)._id.toString() === requestingUser._id.toString()
    );
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    const isAuthorizedForParticipants = isOwner || isMember || isAdmin;

    const participants = isAuthorizedForParticipants
      ? activeMemberDocs.map((m) => this.formatSafeParticipant(m)).filter(Boolean)
      : [];

    return {
      id: room._id.toString(),
      roomCode: room.roomCode,
      name: room.name,
      description: room.description,
      owner: this.formatSafeOwner(room.owner),
      status: room.status,
      maxParticipants: room.maxParticipants,
      participantCount,
      participants,
      isOwner,
      isJoined: isMember,
      createdAt: room.createdAt,
      closedAt: room.closedAt,
    };
  }

  /**
   * Join an active conference room
   */
  public static async joinRoom(rawRoomCode: string, requestingUser: IUser) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode }).populate('owner', 'firstName lastName email role department');

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    if (room.status === RoomStatus.CLOSED) {
      throw new AppError('This room has been closed and cannot accept new participants.', 409);
    }

    // Check existing active membership
    const existingActiveMember = await RoomMember.findOne({
      room: room._id,
      user: requestingUser._id,
      status: RoomMemberStatus.ACTIVE,
    });

    if (existingActiveMember) {
      const activeCount = await RoomMember.countDocuments({
        room: room._id,
        status: RoomMemberStatus.ACTIVE,
      });

      return {
        message: 'You are already an active participant in this room',
        alreadyJoined: true,
        room: {
          id: room._id.toString(),
          roomCode: room.roomCode,
          name: room.name,
          description: room.description,
          owner: this.formatSafeOwner(room.owner),
          status: room.status,
          maxParticipants: room.maxParticipants,
          participantCount: activeCount,
        },
      };
    }

    // Check capacity
    const currentActiveCount = await RoomMember.countDocuments({
      room: room._id,
      status: RoomMemberStatus.ACTIVE,
    });

    if (currentActiveCount >= room.maxParticipants) {
      throw new AppError(`Room '${roomCode}' is full. Maximum limit of ${room.maxParticipants} participants reached.`, 409);
    }

    // Create or reactivate membership
    try {
      const existingMembership = await RoomMember.findOne({
        room: room._id,
        user: requestingUser._id,
      });

      if (existingMembership) {
        existingMembership.status = RoomMemberStatus.ACTIVE;
        existingMembership.joinedAt = new Date();
        existingMembership.leftAt = undefined;
        await existingMembership.save();
      } else {
        await RoomMember.create({
          room: room._id,
          user: requestingUser._id,
          status: RoomMemberStatus.ACTIVE,
          joinedAt: new Date(),
        });
      }
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError('You are already an active member of this room.', 409);
      }
      throw err;
    }

    const updatedActiveCount = await RoomMember.countDocuments({
      room: room._id,
      status: RoomMemberStatus.ACTIVE,
    });

    logger.info(`User ${requestingUser.email} joined room ${roomCode}`);

    return {
      message: 'Joined room successfully',
      alreadyJoined: false,
      room: {
        id: room._id.toString(),
        roomCode: room.roomCode,
        name: room.name,
        description: room.description,
        owner: this.formatSafeOwner(room.owner),
        status: room.status,
        maxParticipants: room.maxParticipants,
        participantCount: updatedActiveCount,
      },
    };
  }

  /**
   * Leave a room
   */
  public static async leaveRoom(rawRoomCode: string, requestingUser: IUser) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode });

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    const activeMembership = await RoomMember.findOne({
      room: room._id,
      user: requestingUser._id,
      status: RoomMemberStatus.ACTIVE,
    });

    if (!activeMembership) {
      throw new AppError('You are not currently an active participant in this room.', 400);
    }

    activeMembership.status = RoomMemberStatus.LEFT;
    activeMembership.leftAt = new Date();
    await activeMembership.save();

    const remainingActiveCount = await RoomMember.countDocuments({
      room: room._id,
      status: RoomMemberStatus.ACTIVE,
    });

    logger.info(`User ${requestingUser.email} left room ${roomCode}`);

    return {
      message: 'Left room successfully',
      roomCode: room.roomCode,
      participantCount: remainingActiveCount,
    };
  }

  /**
   * Update room details (Name, Description, Max Participants)
   * Only room owner or ADMIN authorized.
   */
  public static async updateRoom(rawRoomCode: string, requestingUser: IUser, data: UpdateRoomDTO) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode }).populate('owner', 'firstName lastName email role department');

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    const isOwner = room.owner && (room.owner as any)._id.toString() === requestingUser._id.toString();
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new AppError('Forbidden. Only the room owner or an administrator can edit room details.', 403);
    }

    if (room.status === RoomStatus.CLOSED) {
      throw new AppError('Cannot update a closed room.', 409);
    }

    if (data.maxParticipants !== undefined) {
      const activeCount = await RoomMember.countDocuments({
        room: room._id,
        status: RoomMemberStatus.ACTIVE,
      });

      if (data.maxParticipants < activeCount) {
        throw new AppError(
          `Cannot reduce capacity to ${data.maxParticipants}. Room currently has ${activeCount} active participants.`,
          400
        );
      }
      room.maxParticipants = data.maxParticipants;
    }

    if (data.name !== undefined) {
      room.name = data.name;
    }

    if (data.description !== undefined) {
      room.description = data.description;
    }

    await room.save();

    const participantCount = await RoomMember.countDocuments({
      room: room._id,
      status: RoomMemberStatus.ACTIVE,
    });

    logger.info(`Room ${roomCode} updated by ${requestingUser.email}`);

    return {
      id: room._id.toString(),
      roomCode: room.roomCode,
      name: room.name,
      description: room.description,
      owner: this.formatSafeOwner(room.owner),
      status: room.status,
      maxParticipants: room.maxParticipants,
      participantCount,
      updatedAt: room.updatedAt,
    };
  }

  /**
   * Close a room.
   * Only room owner or ADMIN authorized.
   * Transitions all ACTIVE memberships to LEFT.
   */
  public static async closeRoom(rawRoomCode: string, requestingUser: IUser) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode }).populate('owner', 'firstName lastName email role department');

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    const isOwner = room.owner && (room.owner as any)._id.toString() === requestingUser._id.toString();
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new AppError('Forbidden. Only the room owner or an administrator can close this room.', 403);
    }

    if (room.status !== RoomStatus.CLOSED) {
      room.status = RoomStatus.CLOSED;
      room.closedAt = new Date();
      await room.save();

      // Transition all active memberships to LEFT
      await RoomMember.updateMany(
        { room: room._id, status: RoomMemberStatus.ACTIVE },
        { $set: { status: RoomMemberStatus.LEFT, leftAt: new Date() } }
      );

      logger.info(`Room ${roomCode} CLOSED by ${requestingUser.email}`);
    }

    return {
      id: room._id.toString(),
      roomCode: room.roomCode,
      name: room.name,
      status: room.status,
      closedAt: room.closedAt,
      participantCount: 0,
    };
  }

  /**
   * Generates a short-lived UDP session authorization token.
   * User must be an active participant in an active room.
   */
  public static async generateUdpToken(rawRoomCode: string, requestingUser: IUser) {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await Room.findOne({ roomCode });

    if (!room) {
      throw new AppError(`Room with code '${roomCode}' not found.`, 404);
    }

    if (room.status === RoomStatus.CLOSED) {
      throw new AppError('Cannot generate UDP session token for a closed room.', 409);
    }

    const activeMember = await RoomMember.findOne({
      room: room._id,
      user: requestingUser._id,
      status: RoomMemberStatus.ACTIVE,
    });

    if (!activeMember) {
      throw new AppError('Forbidden. You must be an active participant in this room to obtain a UDP session token.', 403);
    }

    const token = signUdpSessionToken({
      userId: requestingUser._id.toString(),
      roomCode: room.roomCode,
      role: requestingUser.role,
    });

    logger.info(`Generated UDP session token for User: ${requestingUser.email} in Room: ${room.roomCode}`);

    return {
      token,
      roomCode: room.roomCode,
      expiresIn: '5m',
    };
  }
}

