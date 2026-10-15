import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z
    .string({ required_error: 'Room name is required' })
    .min(2, 'Room name must be at least 2 characters')
    .max(100, 'Room name cannot exceed 100 characters')
    .trim(),
  description: z.string().max(500, 'Description cannot exceed 500 characters').trim().optional().default(''),
  maxParticipants: z
    .number({ invalid_type_error: 'Maximum participants must be a number' })
    .int('Maximum participants must be an integer')
    .min(2, 'Minimum participant limit is 2')
    .max(50, 'Maximum participant limit is 50')
    .optional()
    .default(10),
});

export type CreateRoomDTO = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z
    .string()
    .min(2, 'Room name must be at least 2 characters')
    .max(100, 'Room name cannot exceed 100 characters')
    .trim()
    .optional(),
  description: z.string().max(500, 'Description cannot exceed 500 characters').trim().optional(),
  maxParticipants: z
    .number()
    .int('Maximum participants must be an integer')
    .min(2, 'Minimum participant limit is 2')
    .max(50, 'Maximum participant limit is 50')
    .optional(),
});

export type UpdateRoomDTO = z.infer<typeof updateRoomSchema>;

export const roomCodeParamSchema = z.object({
  roomCode: z.string().min(1, 'Room code parameter is required').trim(),
});

export type RoomCodeParamDTO = z.infer<typeof roomCodeParamSchema>;

export const updateRoomAdaptiveConfigSchema = z.object({
  mode: z.enum(['AUTO', 'MANUAL'], { invalid_type_error: "Mode must be 'AUTO' or 'MANUAL'" }).optional(),
  targetProfile: z.enum(['ULTRA', 'HIGH', 'STANDARD', 'CONSTRAINED', 'CRITICAL'], {
    invalid_type_error: "Invalid transmission profile. Allowed: ULTRA, HIGH, STANDARD, CONSTRAINED, CRITICAL",
  }).optional(),
  fecEnabled: z.boolean().optional(),
  maxBitrateKbps: z.number().int().min(8, 'Minimum bitrate is 8 kbps').max(320, 'Maximum bitrate is 320 kbps').optional(),
});

export type UpdateRoomAdaptiveConfigDTO = z.infer<typeof updateRoomAdaptiveConfigSchema>;

