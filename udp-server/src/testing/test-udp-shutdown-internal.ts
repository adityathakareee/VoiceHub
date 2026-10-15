import { envConfig } from '../config/env.config';
import { UdpSocketService } from '../networking/udp.socket';
import { logger } from '../utils/logger';

const verifyUdpShutdown = async (): Promise<void> => {
  logger.info('[UDP SHUTDOWN TEST] Starting Standalone UDP Server for Shutdown Verification...');

  const udpService = new UdpSocketService();

  try {
    await udpService.start(envConfig.UDP_HOST, envConfig.UDP_PORT);
    logger.info(`[UDP SHUTDOWN TEST] UDP server process running and listening on ${envConfig.UDP_HOST}:${envConfig.UDP_PORT}`);

    // Simulate Ctrl+C / SIGINT after 2 seconds
    setTimeout(() => {
      logger.info('\n[UDP SHUTDOWN TEST] >>> Simulating Ctrl+C (SIGINT Signal Emission) <<<');
      process.emit('SIGINT');
    }, 2000);
  } catch (error) {
    logger.error('Fatal error binding UDP server socket:', error);
    process.exit(1);
  }

  const handleGracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`[UDP SHUTDOWN LOG] Received ${signal}. Shutting down UDP server gracefully...`);

    try {
      await udpService.close();
      logger.info('[UDP SHUTDOWN LOG] UDP socket closed cleanly. Process exiting.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during UDP server shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
};

verifyUdpShutdown().catch((error) => {
  logger.error('Unhandled fatal error in UDP shutdown test:', error);
  process.exit(1);
});
