import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import apiRouter from './routes/index';

export const createApp = (): Express => {
  const app: Express = express();

  // Basic security headers & cookie parsing
  app.use(helmet());
  app.use(cookieParser());

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  app.use(corsMiddleware);
  app.use(requestLogger);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
