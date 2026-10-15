import React, { useState, useEffect, useCallback } from 'react';
import { fetchSystemHealth, HealthFetchResult } from '../services/api';
import { audioBridgeClient } from '../services/audioBridgeClient';
import { Icons } from '../components/Icons';

export const SystemStatusView: React.FC = () => {
  const [healthResult, setHealthResult] = useState<HealthFetchResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [bridgeConnected, setBridgeConnected] = useState<boolean>(audioBridgeClient.isConnected);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchSystemHealth();
    setHealthResult(res);
    setBridgeConnected(audioBridgeClient.isConnected);
    setLastCheckTime(new Date().toLocaleTimeString());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 6000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const isApiConnected = !!healthResult?.data?.success;
  const isApiHealthy = healthResult?.data?.status === 'healthy';
  const dbStatus = healthResult?.data?.database?.status || 'disconnected';
  const measuredRtt = healthResult?.measuredResponseTimeMs;

  const SERVICES = [
    {
      name: 'Backend REST API',
      role: 'Control Plane Service',
      port: ':5000',
      transport: 'HTTP/1.1 (TCP)',
      status: isApiConnected ? (isApiHealthy ? 'Operational' : 'Degraded') : 'Offline',
      statusType: isApiConnected ? (isApiHealthy ? 'success' : 'warning') : 'danger',
      details: isApiConnected ? `HTTP 200 OK • Response: ${measuredRtt}ms` : 'Unable to connect to Express backend',
    },
    {
      name: 'MongoDB Database',
      role: 'Persistent Storage Engine',
      port: ':27017',
      transport: 'Mongoose Driver (TCP)',
      status: dbStatus === 'connected' ? 'Connected' : dbStatus === 'connecting' ? 'Degraded' : 'Offline',
      statusType: dbStatus === 'connected' ? 'success' : 'danger',
      details: dbStatus === 'connected' ? 'Database connection healthy • Collections ready' : 'Database disconnected',
    },
    {
      name: 'UDP Media Server',
      role: 'Real-Time Data Plane',
      port: ':5001',
      transport: 'Node.js dgram (UDP)',
      status: 'Configured — Port 5001',
      statusType: 'neutral',
      details: 'Connectionless media router • MTU <= 1200B clamped (No direct HTTP probe)',
    },
    {
      name: 'Local Companion Bridge',
      role: 'Browser Audio Relayer',
      port: ':5002',
      transport: 'WebSocket <-> UDP',
      status: bridgeConnected ? 'Connected' : 'Standby / Port 5002',
      statusType: bridgeConnected ? 'success' : 'neutral',
      details: bridgeConnected ? 'Active WebSocket session registered' : 'Daemon endpoint localhost:5002',
    },
    {
      name: 'WebSocket Control Plane',
      role: 'Real-Time Presence Sync',
      port: ':5000/ws',
      transport: 'WebSocket (TCP)',
      status: isApiConnected ? 'Signaling Ready' : 'Offline',
      statusType: isApiConnected ? 'success' : 'danger',
      details: isApiConnected ? 'In-flight room roster & speaking state endpoint' : 'Signaling server unreachable',
    },
    {
      name: 'Vite Frontend Client',
      role: 'React 18 Single Page App',
      port: ':5173',
      transport: 'HTTP / Web Audio API',
      status: 'Operational',
      statusType: 'success',
      details: 'Client application rendered & active',
    },
  ];

  return (
    <div className="system-status-view">
      {/* Header */}
      <div className="page-header mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Icons.Status size={24} /> System Status & Architecture Telemetry
            </h1>
            <p className="page-subtitle">
              Live service health, process status, and network daemon port allocations across the CSE Voice Hub monorepo.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last poll: <strong>{lastCheckTime || 'Polling...'}</strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={checkHealth}
              disabled={isLoading}
            >
              <Icons.Refresh size={13} /> {isLoading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="section-title">
        <Icons.Signal size={17} /> Core Subsystem Nodes
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        {SERVICES.map((s) => (
          <div key={s.name} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                <div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.role}</span>
                </div>
                <span
                  className={`badge ${
                    s.statusType === 'success'
                      ? 'badge-success'
                      : s.statusType === 'warning'
                      ? 'badge-warning'
                      : 'badge-danger'
                  }`}
                  style={{ fontSize: '10px' }}
                >
                  ● {s.status}
                </span>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)', margin: '0.65rem 0', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Binding Port:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>{s.port}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  <span>Transport:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{s.transport}</span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.details}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Host Environment Summary */}
      <div className="card">
        <h2 className="card-title mb-3" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Host Process Environment
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '12.5px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Process Uptime</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-primary)' }}>
              {healthResult?.data?.uptime ? `${healthResult.data.uptime} seconds` : '—'}
            </strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Measured HTTP Latency</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--brand-primary)' }}>
              {measuredRtt !== null ? `${measuredRtt} ms` : '—'}
            </strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Database Backend</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-success)' }}>
              MongoDB ({dbStatus})
            </strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Security Policy</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-primary)' }}>
              JWT + HMAC SHA-256
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
