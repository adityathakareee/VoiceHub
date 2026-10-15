import mongoose, { Schema, Document, Model } from 'mongoose';

export enum RoomStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export interface IRoom extends Document {
  _id: mongoose.Types.ObjectId;
  roomCode: string;
  name: string;
  description?: string;
  owner: mongoose.Types.ObjectId;
  status: RoomStatus;
  maxParticipants: number;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    roomCode: {
      type: String,
      required: [true, 'Room code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Room name is required'],
      minlength: [2, 'Room name must be at least 2 characters'],
      maxlength: [100, 'Room name cannot exceed 100 characters'],
      trim: true,
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      trim: true,
      default: '',
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Room owner is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(RoomStatus),
      default: RoomStatus.ACTIVE,
      required: true,
      index: true,
    },
    maxParticipants: {
      type: Number,
      required: true,
      min: [2, 'Minimum participants is 2'],
      max: [50, 'Maximum participants is 50'],
      default: 10,
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Room: Model<IRoom> = mongoose.model<IRoom>('Room', roomSchema);
