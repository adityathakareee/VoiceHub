import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name cannot be empty').trim().optional(),
  lastName: z.string().min(1, 'Last name cannot be empty').trim().optional(),
  department: z.string().min(1, 'Department cannot be empty').trim().optional(),
});

export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
