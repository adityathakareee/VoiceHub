import { envConfig } from '../config/env.config';

export interface HealthApiResponse {
  success: boolean;
  service: string;
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected' | 'connecting';
  };
}

export interface HealthFetchResult {
  data: HealthApiResponse | null;
  error: string | null;
  measuredResponseTimeMs: number | null;
}

export const fetchSystemHealth = async (): Promise<HealthFetchResult> => {
  const start = performance.now();
  try {
    const response = await fetch(`${envConfig.apiBaseUrl}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
    });

    const duration = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP Error ${response.status}: ${response.statusText}`,
        measuredResponseTimeMs: duration,
      };
    }

    const data: HealthApiResponse = await response.json();
    return {
      data,
      error: null,
      measuredResponseTimeMs: duration,
    };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    const errorMessage = err instanceof Error ? err.message : 'Network connection failed';
    return {
      data: null,
      error: errorMessage,
      measuredResponseTimeMs: duration,
    };
  }
};
