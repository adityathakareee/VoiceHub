import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { envConfig } from '../config/env.config';
import { User, IUser } from '../models/user.model';
import { AppError } from './error.middleware';
import { logger } from '../utils/logger';

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    // 1. Extract token from HttpOnly cookie or Authorization header
    let token: string | undefined = req.cookies?.[envConfig.COOKIE_NAME];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AppError('Authentication required. Please log in.', 401);
    }

    // 2. Verify JWT signature & expiration
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      logger.warn(`JWT Verification failed: ${err instanceof Error ? err.message : 'Invalid token'}`);
      throw new AppError('Invalid or expired authentication session. Please log in again.', 401);
    }

    // 3. Confirm user exists in database
    const user: IUser | null = await User.findById(decoded.userId);
    if (!user) {
      throw new AppError('The user account belonging to this token no longer exists.', 401);
    }

    // 4. Confirm user account is active
    if (!user.isActive) {
      throw new AppError('This user account has been deactivated. Please contact support.', 401);
    }

    // 5. Invalidate tokens issued prior to password change
    if (user.passwordChangedAt) {
      const userPasswordChangedMs = user.passwordChangedAt.getTime();
      const tokenPasswordChangedMs = decoded.passwordChangedAt;

      // If token does not contain passwordChangedAt OR token's passwordChangedAt doesn't match current DB timestamp
      if (!tokenPasswordChangedMs || tokenPasswordChangedMs !== userPasswordChangedMs) {
        // Fallback check against iat (in seconds)
        const changedTimestampSec = Math.floor(userPasswordChangedMs / 1000);
        if (!decoded.iat || decoded.iat < changedTimestampSec || tokenPasswordChangedMs !== userPasswordChangedMs) {
          throw new AppError('User recently changed password. Please log in again with your new credentials.', 401);
        }
      }
    }

    // 6. Attach authenticated user object to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
