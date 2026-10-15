import { UdpClientRegistry } from './client.registry';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class HeartbeatManager {
  private timer: NodeJS.Timeout | null = null;
  public totalTimeouts = 0;

  constructor(private registry: UdpClientRegistry) {}

  /**
   * Starts periodic heartbeat check timer
   */
  public start(): void {
    if (this.timer) return;

    logger.info(
      `[HEARTBEAT] Starting Heartbeat Manager (Interval: ${envConfig.UDP_HEARTBEAT_INTERVAL_MS}ms, Timeout: ${envConfig.UDP_CLIENT_TIMEOUT_MS}ms)`
    );

    this.timer = setInterval(() => {
      this.checkTimeouts();
    }, envConfig.UDP_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Scans active sessions and purges timed out clients
   */
  public checkTimeouts(): number {
    const now = Date.now();
    const sessions = this.registry.getAllSessions();
    let timedOutCount = 0;

    for (const sess of sessions) {
      const elapsed = now - sess.lastSeen;
      if (elapsed > envConfig.UDP_CLIENT_TIMEOUT_MS) {
        timedOutCount++;
        this.totalTimeouts++;
        logger.warn(
          `[HEARTBEAT] Session ${sess.sessionId} (${sess.userId} in ${sess.roomCode}) timed out after ${elapsed}ms inactivity. Removing from registry.`
        );
        this.registry.removeSession(sess.sessionId);
      }
    }

    return timedOutCount;
  }

  /**
   * Stops heartbeat check timer
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[HEARTBEAT] Heartbeat Manager stopped cleanly');
    }
  }
}
