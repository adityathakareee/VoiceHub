import { dbService, DbStatus } from '../config/db.config';

export interface HealthResponse {
  success: boolean;
  service: string;
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  database: {
    status: DbStatus;
  };
}

export class HealthService {
  public static getSystemHealth(): HealthResponse {
    const dbStatus = dbService.getStatus();
    const isHealthy = dbStatus === DbStatus.CONNECTED;

    return {
      success: true,
      service: 'CSE Voice Hub API',
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime() * 100) / 100,
      database: {
        status: dbStatus,
      },
    };
  }
}
