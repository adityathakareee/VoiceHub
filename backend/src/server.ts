import http from 'http';
import { envConfig } from './config/env.config';
import { dbService } from './config/db.config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { controlWsService } from './services/control-ws.service';

const startServer = async (): Promise<void> => {
  logger.info('Starting CSE Voice Hub API Server...');

  await dbService.connect();

  const app = createApp();
  const server = http.createServer(app);

  // Initialize Real-Time Control & Presence WebSocket Layer
  controlWsService.init(server);

  server.listen(envConfig.PORT, () => {
    logger.info(`Backend API server running successfully on port ${envConfig.PORT} [http://localhost:${envConfig.PORT}]`);
  });

  const handleGracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    try {
      await controlWsService.close();
    } catch (wsErr) {
      logger.error('Error closing WebSocket control server:', wsErr);
    }

    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server:', err);
      } else {
        logger.info('HTTP server closed cleanly.');
      }

      await dbService.disconnect();
      logger.info('Graceful shutdown completed successfully. Exiting.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown triggered after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
};

startServer().catch((error) => {
  logger.error('Fatal error during backend server startup:', error);
  process.exit(1);
});
