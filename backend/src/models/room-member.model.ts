import mongoose, { Schema, Document, Model } from 'mongoose';

export enum RoomMemberStatus {
  ACTIVE = 'ACTIVE',
  LEFT = 'LEFT',
}

export interface IRoomMember extends Document {
  _id: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  status: RoomMemberStatus;
  joinedAt: Date;
  leftAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const roomMemberSchema = new Schema<IRoomMember>(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'Room reference is required'],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(RoomMemberStatus),
      default: RoomMemberStatus.ACTIVE,
      required: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    leftAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// General compound query index
roomMemberSchema.index({ room: 1, user: 1, status: 1 });

// Critical partial unique index: Enforces ONE active membership per room per user at database level
roomMemberSchema.index(
  { room: 1, user: 1 },
  {
    unique: true,
    partialFilterExpression: { status: RoomMemberStatus.ACTIVE },
  }
);

export const RoomMember: Model<IRoomMember> = mongoose.model<IRoomMember>('RoomMember', roomMemberSchema);
