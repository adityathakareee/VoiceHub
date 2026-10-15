import http from 'http';
import { envConfig } from '../config/env.config';
import { dbService } from '../config/db.config';
import { createApp } from '../app';
import { logger } from '../utils/logger';

const verifyBackendShutdown = async (): Promise<void> => {
  logger.info('[SHUTDOWN TEST] Starting CSE Voice Hub API Server for Shutdown Verification...');

  await dbService.connect();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(envConfig.PORT, () => {
    logger.info(`[SHUTDOWN TEST] Backend API server running successfully on port ${envConfig.PORT} [http://localhost:${envConfig.PORT}]`);

    // Simulate Ctrl+C / SIGINT after 2 seconds
    setTimeout(() => {
      logger.info('\n[SHUTDOWN TEST] >>> Simulating Ctrl+C (SIGINT Signal Emission) <<<');
      process.emit('SIGINT');
    }, 2000);
  });

  const handleGracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`[SHUTDOWN LOG] Received ${signal}. Initiating graceful shutdown...`);

    server.close(async (err) => {
      if (err) {
        logger.error('[SHUTDOWN LOG] Error closing HTTP server:', err);
      } else {
        logger.info('[SHUTDOWN LOG] HTTP server closed cleanly.');
      }

      await dbService.disconnect();
      logger.info('[SHUTDOWN LOG] Graceful shutdown completed successfully. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
};

verifyBackendShutdown().catch((err) => {
  logger.error('Fatal error during shutdown test:', err);
  process.exit(1);
});
