import { User, IUser } from '../models/user.model';
import { UpdateProfileDTO, ChangePasswordDTO } from '../schemas/user.schema';
import { hashPassword, comparePassword, validatePasswordPolicy } from '../utils/password';
import { formatSafeUser, SafeUserResponse } from './auth.service';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class UserService {
  public static async updateProfile(userId: string, data: UpdateProfileDTO): Promise<SafeUserResponse> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404);
    }

    if (data.firstName) user.firstName = data.firstName.trim();
    if (data.lastName) user.lastName = data.lastName.trim();
    if (data.department) user.department = data.department.trim();

    await user.save();
    logger.info(`Profile updated for user [ID=${user._id}]`);

    return formatSafeUser(user);
  }

  public static async changePassword(userId: string, data: ChangePasswordDTO): Promise<void> {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      throw new AppError('User not found.', 404);
    }

    // 1. Verify current password
    const isMatch = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Current password is incorrect.', 401);
    }

    // 2. Validate new password policy
    const policyResult = validatePasswordPolicy(data.newPassword);
    if (!policyResult.isValid) {
      throw new AppError(policyResult.message || 'New password does not meet security policy.', 400);
    }

    // 3. Hash & update new password
    user.passwordHash = await hashPassword(data.newPassword);
    // Set passwordChangedAt timestamp for JWT session invalidation
    user.passwordChangedAt = new Date();
    await user.save();

    logger.info(`Password changed successfully for user [ID=${user._id}]`);
  }
}
