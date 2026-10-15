import { Request, Response } from 'express';
import { HealthService } from '../services/health.service';

export class HealthController {
  public static getHealth(_req: Request, res: Response): void {
    const healthData = HealthService.getSystemHealth();
    res.status(200).json(healthData);
  }

  public static getSystemMetrics(_req: Request, res: Response): void {
    const memory = process.memoryUsage();
    res.status(200).json({
      success: true,
      service: 'CSE Voice Hub System Telemetry',
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
        heapTotalMb: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
        heapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
      },
      telemetryStatus: 'ACTIVE',
      timestamp: Date.now(),
    });
  }
}
