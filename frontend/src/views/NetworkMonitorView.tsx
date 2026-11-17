import React, { useState, useEffect } from 'react';
import { audioBridgeClient, NetworkMetrics } from '../services/audioBridgeClient';
import { Icons } from '../components/Icons';

export const NetworkMonitorView: React.FC = () => {
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(audioBridgeClient.latestMetrics);
  const [isConnected, setIsConnected] = useState<boolean>(audioBridgeClient.isConnected);
  const [sessionId, setSessionId] = useState<string | null>(audioBridgeClient.sessionId);

  useEffect(() => {
    setIsConnected(audioBridgeClient.isConnected);
    setSessionId(audioBridgeClient.sessionId);

    const handleMessage = (data: any) => {
      if (data.type === 'NETWORK_METRICS' && data.metrics) {
        setMetrics(data.metrics);
      }
      if (data.type === 'SESSION_STATUS') {
        setIsConnected(data.status === 'REGISTERED');
        if (data.sessionId) setSessionId(data.sessionId);
      }
    };

    audioBridgeClient.addMessageListener(handleMessage);
    return () => {
      audioBridgeClient.removeMessageListener(handleMessage);
    };
  }, []);

  return (
    <div className="network-monitor-view">
      {/* Header */}
      <div className="page-header mb-6">
        <h1 className="page-title flex items-center gap-2">
          <Icons.Network size={24} /> Network Monitor
        </h1>
        <p className="page-subtitle">
          Real-time User Datagram Protocol (UDP) telemetry, sequence accounting, and RFC 3550 statistical quality assessment.
        </p>
      </div>

      {/* Connection & Session Banner */}
      <div className="card card--banner mb-6" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Data Plane Status
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span className={`pulse-dot ${isConnected ? '' : 'pulse-warning'}`} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isConnected ? 'Active UDP Telemetry Stream' : 'Idle / Ready (No Active Media Call)'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '12px' }}>
            <span className="badge badge-neutral">
              Session ID: <strong style={{ fontFamily: 'var(--font-mono)' }}>{sessionId || 'Unregistered'}</strong>
            </span>
            <span className="badge badge-info">
              MTU: <strong>1200 Bytes Max</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="section-title">
        <Icons.Signal size={17} /> Live Transmission Telemetry
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* RTT */}
        <div className="card metric-card metric-card--rtt">
          <div className="metric-card-label">Round-Trip Latency (RTT)</div>
          <div className="metric-card-value" style={{ color: 'var(--brand-primary)' }}>
            {metrics ? `${metrics.rttMs} ms` : 'N/A'}
          </div>
          <div className="metric-card-sub">
            {metrics ? 'Measured via UDP PING/PONG loopback probes' : 'Awaiting active audio session'}
          </div>
        </div>

        {/* RFC 3550 Jitter */}
        <div className="card metric-card metric-card--jitter">
          <div className="metric-card-label">RFC 3550 Jitter</div>
          <div className="metric-card-value" style={{ color: 'var(--accent-cyan)' }}>
            {metrics ? `${metrics.jitterMs} ms` : 'N/A'}
          </div>
          <div className="metric-card-sub">
            {metrics ? 'First-order recursive statistical delay variance' : 'Awaiting active audio session'}
          </div>
        </div>

        {/* Packet Loss */}
        <div className="card metric-card metric-card--loss">
          <div className="metric-card-label">Packet Loss Fraction</div>
          <div className="metric-card-value" style={{ color: metrics ? ((metrics.packetLossPercent > 2) ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--text-muted)' }}>
            {metrics ? `${metrics.packetLossPercent}%` : 'N/A'}
          </div>
          <div className="metric-card-sub">
            {metrics ? `${metrics.packetsLost} packets dropped` : 'No active stream'}
          </div>
        </div>

        {/* Channel Quality */}
        <div className="card metric-card metric-card--quality">
          <div className="metric-card-label">Quality Classification</div>
          <div className="metric-card-value" style={{ color: metrics ? 'var(--color-success)' : 'var(--text-muted)', fontSize: '1.25rem' }}>
            {metrics?.qualityRating || 'Waiting for stream'}
          </div>
          <div className="metric-card-sub">
            E-Model inspired operational band
          </div>
        </div>
      </div>

      {/* Packet Accounting & Throughput */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Packet Accounting Table */}
        <div className="card card--telemetry">
          <h2 className="card-title mb-3" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Sequence & Packet Counters
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Packets Transmitted</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{metrics?.packetsSent ?? '—'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Packets Received</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-success)' }}>
                {metrics?.packetsReceived ?? '—'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Sequence Gap Drops</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-danger)' }}>
                {metrics?.packetsLost ?? 0}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Bytes Ingested</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {metrics?.bytesReceived ? `${Math.round(metrics.bytesReceived / 1024)} KB` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Throughput Bitrate Card */}
        <div className="card card--telemetry">
          <h2 className="card-title mb-3" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Throughput Bitrates (1-Second Rolling Window)
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="metric-card metric-card--rtt">
              <div className="metric-card-label">Uplink Bitrate ↑</div>
              <div className="metric-card-value" style={{ fontSize: '1.35rem', color: 'var(--brand-primary)' }}>
                {metrics ? `${metrics.bitrateUpKbps}` : 'N/A'}
              </div>
              <div className="metric-card-sub">kbps (Kilobits/sec)</div>
            </div>

            <div className="metric-card metric-card--jitter">
              <div className="metric-card-label">Downlink Bitrate ↓</div>
              <div className="metric-card-value" style={{ fontSize: '1.35rem', color: 'var(--accent-cyan)' }}>
                {metrics ? `${metrics.bitrateDownKbps}` : 'N/A'}
              </div>
              <div className="metric-card-sub">kbps (Kilobits/sec)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Educational & Scientific References */}
      <div className="card" style={{ background: '#FFFFFF' }}>
        <h2 className="section-title" style={{ fontSize: '0.95rem' }}>
          <Icons.Shield size={16} /> RFC 3550 Telemetry Standards Compliance
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
              Statistical Jitter Filter
            </strong>
            <code>J_i = J_{'{i-1}'} + (|D(i-1, i)| - J_{'{i-1}'}) / 16</code>
            <p style={{ marginTop: '0.35rem', fontSize: '11.5px', color: 'var(--text-muted)' }}>
              First-order recursive gain factor providing stability against transient inter-arrival variance spikes.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
              Quality Classification Bands
            </strong>
            <p style={{ fontSize: '11.5px' }}>
              • <strong>EXCELLENT:</strong> RTT $\le 60$ms, Jitter $\le 15$ms, Loss $\le 1\%$<br />
              • <strong>GOOD:</strong> RTT $\le 150$ms, Jitter $\le 30$ms, Loss $\le 3\%$<br />
              • <strong>FAIR:</strong> RTT $\le 300$ms, Jitter $\le 60$ms, Loss $\le 8\%$<br />
              • <strong>POOR:</strong> Exceeds fair operational boundary
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
