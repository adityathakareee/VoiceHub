import dgram from 'dgram';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

const runPingPongTest = (): void => {
  logger.info('[UDP TEST] Starting UDP Ping/Pong Smoke Test...');

  const client = dgram.createSocket('udp4');
  const targetPort = envConfig.UDP_PORT;
  const targetHost = '127.0.0.1';
  const pingMessage = Buffer.from('PING');

  let testPassed = false;

  const timeoutTimer = setTimeout(() => {
    if (!testPassed) {
      logger.error(`[UDP TEST] FAIL: Timeout waiting for PONG response from ${targetHost}:${targetPort}`);
      client.close();
      process.exit(1);
    }
  }, 3000);

  client.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    const response = msg.toString('utf-8').trim();
    logger.info(`[UDP TEST] Received response from ${rinfo.address}:${rinfo.port}: "${response}"`);

    if (response === 'PONG') {
      testPassed = true;
      clearTimeout(timeoutTimer);
      logger.info('[UDP TEST] PASS: Received expected PONG packet from UDP server!');
      client.close(() => {
        logger.info('[UDP TEST] Test client socket closed cleanly. Test execution complete.');
        process.exit(0);
      });
    } else {
      logger.error(`[UDP TEST] FAIL: Unexpected response received: "${response}"`);
      clearTimeout(timeoutTimer);
      client.close();
      process.exit(1);
    }
  });

  client.on('error', (err) => {
    logger.error('[UDP TEST] FAIL: Socket error during test:', err);
    clearTimeout(timeoutTimer);
    client.close();
    process.exit(1);
  });

  logger.info(`[UDP TEST] Sending "PING" packet to ${targetHost}:${targetPort}...`);
  client.send(pingMessage, 0, pingMessage.length, targetPort, targetHost, (err) => {
    if (err) {
      logger.error('[UDP TEST] FAIL: Failed to send PING packet:', err);
      clearTimeout(timeoutTimer);
      client.close();
      process.exit(1);
    }
    logger.info('[UDP TEST] PING packet dispatched successfully. Awaiting PONG...');
  });
};

runPingPongTest();
