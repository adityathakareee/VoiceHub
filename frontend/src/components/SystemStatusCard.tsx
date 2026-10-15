import React, { useEffect, useState, useCallback } from 'react';
import { fetchSystemHealth, HealthFetchResult } from '../services/api';

export const SystemStatusCard: React.FC = () => {
  const [result, setResult] = useState<HealthFetchResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchSystemHealth();
    setResult(res);
    setLastCheckTime(new Date().toLocaleTimeString());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const isConnected = !!result?.data?.success;
  const isHealthy = result?.data?.status === 'healthy';
  const dbStatus = result?.data?.database?.status || 'disconnected';

  return (
    <div className="card status-card">
      <div className="card-header">
        <h2>Live System Telemetry</h2>
        <div className="card-actions">
          <span className="last-check">Checked: {lastCheckTime || 'Never'}</span>
          <button 
            className="btn-refresh" 
            onClick={checkHealth} 
            disabled={isLoading}
            title="Refresh System Health Status"
          >
            {isLoading ? 'Polling...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      <div className="grid-metrics">
        {/* Backend API Metric */}
        <div className={`metric-box ${isConnected ? 'status-active' : 'status-down'}`}>
          <div className="metric-label">Backend REST API</div>
          <div className="metric-value">
            {isConnected ? (isHealthy ? 'Healthy' : 'Degraded') : 'Unavailable'}
          </div>
          <div className="metric-subtext">
            {isConnected ? `Status: HTTP 200 OK` : (result?.error || 'Connection Failed')}
          </div>
        </div>

        {/* Database Metric */}
        <div className={`metric-box ${dbStatus === 'connected' ? 'status-active' : 'status-warning'}`}>
          <div className="metric-label">MongoDB Storage</div>
          <div className="metric-value">
            {dbStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
          <div className="metric-subtext">
            {dbStatus === 'connected' ? 'Mongoose Connection Ready' : 'Database Offline (Degraded Mode)'}
          </div>
        </div>

        {/* Measured Latency Metric */}
        <div className="metric-box">
          <div className="metric-label">API Response Time</div>
          <div className="metric-value">
            {result && result.measuredResponseTimeMs !== null ? `${result.measuredResponseTimeMs} ms` : '—'}
          </div>
          <div className="metric-subtext">Actual Measured Roundtrip</div>
        </div>

        {/* Backend Uptime Metric */}
        <div className="metric-box">
          <div className="metric-label">Backend Process Uptime</div>
          <div className="metric-value">
            {result?.data?.uptime ? `${result.data.uptime} s` : '—'}
          </div>
          <div className="metric-subtext">Server Runtime Duration</div>
        </div>
      </div>

      <div className="notice-banner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          <strong>Phase 8 Adaptive UDP Active:</strong> AIMD dynamic rate control, RFC 2198 redundant loss recovery (FEC), and adaptive playout delay compensation are now fully integrated and active in conference room sessions.
        </span>
      </div>
    </div>
  );
};
