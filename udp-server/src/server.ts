import { envConfig } from './config/env.config';
import { UdpSocketService } from './networking/udp.socket';
import { logger } from './utils/logger';

const startUdpServer = async (): Promise<void> => {
  logger.info('Starting CSE Voice Hub Standalone UDP Server...');

  const udpService = new UdpSocketService();

  try {
    await udpService.start(envConfig.UDP_HOST, envConfig.UDP_PORT);
    logger.info(`UDP server process running on ${envConfig.UDP_HOST}:${envConfig.UDP_PORT}`);
  } catch (error) {
    logger.error('Fatal error binding UDP server socket:', error);
    process.exit(1);
  }

  const handleGracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down UDP server gracefully...`);

    try {
      await udpService.close();
      logger.info('UDP server shutdown completed cleanly. Exiting.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during UDP server shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
};

startUdpServer().catch((error) => {
  logger.error('Unhandled fatal error in UDP server process:', error);
  process.exit(1);
});
