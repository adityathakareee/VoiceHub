/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/user.model';
import { AppError } from './error.middleware';

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
};
