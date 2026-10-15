/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { AuthService, getAuthCookieOptions, formatSafeUser } from '../services/auth.service';
import { envConfig } from '../config/env.config';
import { AppError } from '../middleware/error.middleware';

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 400);
      }

      const user = await AuthService.register(parseResult.data);
      res.status(201).json({
        success: true,
        message: 'Registration successful. You can now log in.',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        throw new AppError(`Validation failed: ${errorMsg}`, 400);
      }

      const { user, token } = await AuthService.login(parseResult.data);
      const cookieOptions = getAuthCookieOptions();

      // Set HttpOnly authentication cookie
      res.cookie(envConfig.COOKIE_NAME, token, cookieOptions);

      res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public static logout(_req: Request, res: Response): void {
    const cookieOptions = getAuthCookieOptions();
    // Clear HttpOnly authentication cookie
    res.clearCookie(envConfig.COOKIE_NAME, {
      ...cookieOptions,
      maxAge: 0,
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful.',
    });
  }

  public static getMe(req: Request, res: Response, next: NextFunction): void {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401);
      }

      res.status(200).json({
        success: true,
        data: { user: formatSafeUser(req.user) },
      });
    } catch (error) {
      next(error);
    }
  }
}
