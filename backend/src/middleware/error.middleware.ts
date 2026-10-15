import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { envConfig } from '../config/env.config';

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404);
  next(error);
};

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'An unexpected internal server error occurred';

  logger.error(`Error Middleware Caught [${statusCode}]: ${message}`, err);

  const response: { success: boolean; message: string; stack?: string } = {
    success: false,
    message,
  };

  if (envConfig.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
