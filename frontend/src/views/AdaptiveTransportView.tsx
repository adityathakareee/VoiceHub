import React, { useState, useEffect } from 'react';
import { audioBridgeClient, AdaptiveState, NetworkMetrics } from '../services/audioBridgeClient';
import { Icons } from '../components/Icons';

type TransmissionProfile = 'ULTRA' | 'HIGH' | 'STANDARD' | 'CONSTRAINED' | 'CRITICAL';

export const AdaptiveTransportView: React.FC = () => {
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState | null>(audioBridgeClient.latestAdaptiveState);
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(audioBridgeClient.latestMetrics);

  useEffect(() => {
    const handleMessage = (data: any) => {
      if (data.type === 'ADAPTIVE_STATE_UPDATE' && data.adaptiveState) {
        setAdaptiveState(data.adaptiveState);
      }
      if (data.type === 'NETWORK_METRICS' && data.metrics) {
        setMetrics(data.metrics);
      }
    };

    audioBridgeClient.addMessageListener(handleMessage);
    return () => {
      audioBridgeClient.removeMessageListener(handleMessage);
    };
  }, []);

  const activeProfile: TransmissionProfile | null = adaptiveState?.profile || null;
  const mode = adaptiveState?.mode || 'AUTO';

  const handleSetMode = (newMode: 'AUTO' | 'MANUAL', profile?: TransmissionProfile) => {
    audioBridgeClient.setTransmissionMode(newMode, profile);
    // Optimistic local update
    if (adaptiveState) {
      setAdaptiveState({
        ...adaptiveState,
        mode: newMode,
        profile: profile || adaptiveState.profile,
      });
    }
  };

  const PROFILES = [
    {
      id: 'ULTRA' as TransmissionProfile,
      bitrate: 96,
      frameInterval: 15,
      samples: 240,
      format: 'PCM16 Linear',
      wireBytes: '480 B (Payload)',
      condition: 'Pristine channel (Loss <= 1.0%, RTT <= 60ms, 3+ intervals)',
    },
    {
      id: 'HIGH' as TransmissionProfile,
      bitrate: 80,
      frameInterval: 20,
      samples: 320,
      format: 'PCM16 Linear',
      wireBytes: '640 B (Payload)',
      condition: 'Excellent channel (Loss <= 1.0%, RTT <= 60ms)',
    },
    {
      id: 'STANDARD' as TransmissionProfile,
      bitrate: 64,
      frameInterval: 20,
      samples: 320,
      format: 'PCM16 Linear',
      wireBytes: '640 B (Payload)',
      condition: 'Nominal operational standard (Loss <= 3.0%, RTT <= 150ms)',
    },
    {
      id: 'CONSTRAINED' as TransmissionProfile,
      bitrate: 32,
      frameInterval: 25,
      samples: 400,
      format: 'PCM8 Companded',
      wireBytes: '400 B (Companded)',
      condition: 'Congested channel (Loss > 3.0% or RTT > 150ms)',
    },
    {
      id: 'CRITICAL' as TransmissionProfile,
      bitrate: 16,
      frameInterval: 40,
      samples: 640,
      format: 'PCM8 Decimated x2',
      wireBytes: '320 B (Decimated)',
      condition: 'Severe impairment (Loss > 8.0% or RTT > 300ms)',
    },
  ];

  return (
    <div className="adaptive-transport-view">
      {/* Header */}
      <div className="page-header mb-6">
        <h1 className="page-title flex items-center gap-2">
          <Icons.Adaptive size={24} /> Adaptive Transport Engine
        </h1>
        <p className="page-subtitle">
          Real-time network-aware UDP rate pacing, dynamic framing elasticity, and RFC 2198-inspired redundant audio framing.
        </p>
      </div>

      {/* Control Banner: Mode Switcher */}
      <div className="card card--banner mb-6" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Adaptation Engine State
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span className="pulse-dot" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {mode === 'AUTO' ? 'Autonomous Closed-Loop AIMD Mode' : 'Manual Profile Override Locked'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Reason: <em>{adaptiveState?.reason || 'Standby — awaiting active audio stream'}</em>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'AUTO' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleSetMode('AUTO')}
            >
              Autonomous (AIMD)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'MANUAL' ? 'btn-outline' : 'btn-secondary'}`}
              onClick={() => handleSetMode('MANUAL', activeProfile || undefined)}
            >
              Manual Lock
            </button>
          </div>
        </div>
      </div>

      {/* Profile Selection Matrix */}
      <div className="section-title">
        <Icons.Signal size={17} /> Five Dynamic Transmission Profiles
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {PROFILES.map((p) => {
          const isSelected = activeProfile === p.id;
          return (
            <div
              key={p.id}
              className="card"
              style={{
                borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-color)',
                boxShadow: isSelected ? '0 0 0 2px rgba(29, 78, 216, 0.2), var(--shadow-sm)' : 'var(--shadow-xs)',
                position: 'relative',
                background: isSelected ? 'var(--bg-accent)' : 'var(--bg-surface)',
                cursor: mode === 'MANUAL' ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (mode === 'MANUAL') handleSetMode('MANUAL', p.id);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                  {p.id}
                </span>
                {isSelected ? (
                  <span className="badge badge-success" style={{ fontSize: '9px', padding: '0.15rem 0.4rem' }}>
                    ACTIVE
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.bitrate}k</span>
                )}
              </div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                {p.bitrate} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>kbps</span>
              </div>

              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                <div>⏱ <strong>{p.frameInterval} ms</strong> ({p.samples} samples)</div>
                <div>📦 {p.format}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{p.wireBytes}</div>
              </div>

              {mode === 'MANUAL' && (
                <button
                  type="button"
                  className={`btn btn-sm w-full mt-2 ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '11px', padding: '0.25rem 0.5rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetMode('MANUAL', p.id);
                  }}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Measured Conditions vs Adaptive Response Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Measured Conditions */}
        <div className="card card--telemetry">
          <h2 className="card-title mb-3" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Observed Telemetry Inputs
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div className="metric-card metric-card--rtt">
              <div className="metric-card-label">RTT</div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem', color: 'var(--brand-primary)' }}>
                {metrics ? `${metrics.rttMs} ms` : 'N/A'}
              </div>
            </div>

            <div className="metric-card metric-card--jitter">
              <div className="metric-card-label">Jitter</div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem', color: 'var(--accent-cyan)' }}>
                {metrics ? `${metrics.jitterMs} ms` : 'N/A'}
              </div>
            </div>

            <div className="metric-card metric-card--loss">
              <div className="metric-card-label">Packet Loss</div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem', color: metrics ? ((metrics.packetLossPercent > 2) ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--text-muted)' }}>
                {metrics ? `${metrics.packetLossPercent}%` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Adaptive Response */}
        <div className="card card--adaptive">
          <h2 className="card-title mb-3" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Computed Adaptive Response
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div className="metric-card metric-card--frame">
              <div className="metric-card-label">Framing</div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                {adaptiveState ? `${adaptiveState.frameIntervalMs} ms` : 'Idle'}
              </div>
            </div>

            <div className="metric-card metric-card--redundancy">
              <div className="metric-card-label">FEC Mode</div>
              <div className="metric-card-value" style={{ fontSize: '1.1rem', color: adaptiveState?.fecActive ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {adaptiveState ? (adaptiveState.fecActive ? 'ACTIVE' : 'STANDBY') : 'Standby'}
              </div>
            </div>

            <div className="metric-card metric-card--delay">
              <div className="metric-card-label">Playout Delay</div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem', color: '#4F46E5' }}>
                {adaptiveState ? `${adaptiveState.targetPlayoutDelayMs} ms` : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mathematical Formulations & Anti-Flapping Hysteresis */}
      <div className="card" style={{ background: '#FFFFFF' }}>
        <h2 className="section-title" style={{ fontSize: '0.95rem' }}>
          <Icons.Shield size={16} /> Mathematical Formulations & Hysteresis Rules
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
              Dynamic Playout Delay Formula
            </strong>
            <code>clamp(20ms, 200ms, round(2.5 * Jitter + 0.1 * RTT + 15ms))</code>
            <p style={{ marginTop: '0.35rem', fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Safely expands the receiver buffer under packet delay variance while preventing unbounded conversational latency.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
              FEC Hysteresis Deadband Rule
            </strong>
            <p style={{ fontSize: '11.5px' }}>
              • <strong>Activate FEC:</strong> Loss $\ge 2.0\%$ (attaches companded previous frame)<br />
              • <strong>Deactivate FEC:</strong> Loss $&lt; 1.0\%$ (conserve bandwidth)<br />
              • <strong>Deadband $[1.0\%, 2.0\%]$:</strong> Preserves state to prevent flapping
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
