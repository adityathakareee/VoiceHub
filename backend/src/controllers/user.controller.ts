/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { updateProfileSchema, changePasswordSchema } from '../schemas/user.schema';
import { UserService } from '../services/user.service';
import { getAuthCookieOptions } from '../services/auth.service';
import { envConfig } from '../config/env.config';
import { AppError } from '../middleware/error.middleware';

export class UserController {
  public static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const parseResult = updateProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 400);
      }

      const updatedUser = await UserService.updateProfile(req.user._id.toString(), parseResult.data);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: { user: updatedUser },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      const parseResult = changePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 400);
      }

      await UserService.changePassword(req.user._id.toString(), parseResult.data);

      // Invalidate existing authentication session cookie on password change
      const cookieOptions = getAuthCookieOptions();
      res.clearCookie(envConfig.COOKIE_NAME, {
        ...cookieOptions,
        maxAge: 0,
      });

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. Your session has been invalidated. Please log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }
}
