import React from 'react';
import { useRealtimeAudio } from '../hooks/useRealtimeAudio';
import { Icons } from './Icons';

interface AudioConferencePanelProps {
  roomCode: string;
  isRoomActive: boolean;
}

export const AudioConferencePanel: React.FC<AudioConferencePanelProps> = ({ roomCode, isRoomActive }) => {
  const {
    sessionState,
    micPermission,
    isMuted,
    errorMessage,
    framesSent,
    framesReceivedTotal,
    remoteParticipants,
    networkMetrics,
    adaptiveState,
    setTransmissionMode,
    startAudio,
    stopAudio,
    toggleMute,
  } = useRealtimeAudio({ roomCode });

  if (!isRoomActive) {
    return (
      <div className="card mb-6" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B45309' }}>
          <Icons.AlertTriangle size={18} />
          <strong>Audio Channel Disabled:</strong> This conference room has been closed by its host.
        </div>
      </div>
    );
  }

  const isConnected = sessionState === 'CONNECTED';
  const isConnecting =
    sessionState === 'CONNECTING_BRIDGE' || sessionState === 'OBTAINING_TOKEN' || sessionState === 'REGISTERING_UDP';

  return (
    <div className="audio-conference-subsystem mb-6">
      {/* Error & Warning Banners */}
      {errorMessage && (
        <div className="alert alert-error mb-4">
          <Icons.AlertTriangle size={16} />
          <div>
            <strong>Audio Connection Issue:</strong> {errorMessage}
            {errorMessage.includes('local audio bridge') && (
              <div style={{ marginTop: '0.25rem', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
                Tip: Ensure companion bridge is running via <code>npm run dev:bridge</code>.
              </div>
            )}
          </div>
        </div>
      )}

      {micPermission === 'denied' && (
        <div className="alert alert-warning mb-4">
          <Icons.AlertTriangle size={16} />
          <div>Microphone access was denied. Please allow microphone permissions in browser settings.</div>
        </div>
      )}

      {/* Main Controls Card */}
      <div className="card mb-4" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: isConnected ? 'var(--color-success-bg)' : 'var(--bg-accent)', color: isConnected ? 'var(--color-success)' : 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Mic size={16} />
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Real-Time UDP Audio Channel
              </h3>
              <span
                className={`badge ${
                  isConnected
                    ? 'badge-success'
                    : isConnecting
                    ? 'badge-warning'
                    : 'badge-neutral'
                }`}
                style={{ fontSize: '10.5px' }}
              >
                ● {sessionState.replace(/_/g, ' ')}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              16 kHz Mono Linear PCM16 • Native Companion Bridge WebSocket Proxy • Non-Echo Isolated Routing
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!isConnected && !isConnecting && (
              <button
                id="connect-audio-btn"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={startAudio}
              >
                <Icons.Mic size={14} /> Connect Microphone
              </button>
            )}

            {isConnecting && (
              <button type="button" className="btn btn-secondary btn-sm" disabled>
                <span className="spinner" style={{ width: 12, height: 12 }} />
                <span>Connecting UDP...</span>
              </button>
            )}

            {isConnected && (
              <>
                <button
                  id="toggle-mute-btn"
                  type="button"
                  className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={toggleMute}
                >
                  {isMuted ? <Icons.MicOff size={14} /> : <Icons.Mic size={14} />}
                  <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                </button>

                <button
                  id="disconnect-audio-btn"
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={stopAudio}
                >
                  Disconnect Audio
                </button>
              </>
            )}
          </div>
        </div>

        {/* Diagnostic Stat Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', textAlign: 'center' }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Mic State</span>
            <strong style={{ fontSize: '13px', color: isMuted ? 'var(--color-danger)' : isConnected ? 'var(--color-success)' : 'var(--text-secondary)' }}>
              {isMuted ? 'Muted' : isConnected ? 'Active Transmitting' : 'Ready'}
            </strong>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Frames Sent</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--brand-primary)' }}>
              {framesSent}
            </strong>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Frames Received</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-success)' }}>
              {framesReceivedTotal}
            </strong>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Remote Streams</span>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent-cyan)' }}>
              {remoteParticipants.length} Active
            </strong>
          </div>
        </div>
      </div>

      {/* Live Telemetry & Adaptive Control Panels (Visible when connected) */}
      {isConnected && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          {/* Telemetry HUD */}
          <div className="card" style={{ background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icons.Network size={14} /> Telemetry HUD (RFC 3550)
              </div>
              {networkMetrics && (
                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                  {networkMetrics.qualityRating} QUALITY
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>RTT</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--brand-primary)' }}>
                  {networkMetrics ? `${networkMetrics.rttMs}ms` : '—'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Jitter</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent-cyan)' }}>
                  {networkMetrics ? `${networkMetrics.jitterMs}ms` : '0ms'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Loss</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: (networkMetrics?.packetLossPercent ?? 0) > 2 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {networkMetrics ? `${networkMetrics.packetLossPercent}%` : '0%'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Bitrate</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)' }}>
                  {networkMetrics ? `${networkMetrics.bitrateUpKbps}k↑` : '64k'}
                </strong>
              </div>
            </div>
          </div>

          {/* Adaptive Transport HUD */}
          <div className="card" style={{ background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icons.Adaptive size={14} /> Adaptive Transport HUD
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <span className="badge badge-info" style={{ fontSize: '10px' }}>
                  {adaptiveState?.profile || 'STANDARD'} ({adaptiveState?.targetBitrateKbps || 64}k)
                </span>
                <span className={`badge ${adaptiveState?.fecActive ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '10px' }}>
                  FEC: {adaptiveState?.fecActive ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', marginBottom: '0.5rem' }}>
              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Framing</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {adaptiveState ? `${adaptiveState.frameIntervalMs} ms` : '20 ms'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Playout</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--brand-secondary)' }}>
                  {adaptiveState ? `${adaptiveState.targetPlayoutDelayMs} ms` : '35 ms'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Mode</span>
                <strong style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
                  {adaptiveState?.mode === 'AUTO' ? 'AIMD AUTO' : 'MANUAL'}
                </strong>
              </div>
            </div>

            {/* Quick manual control pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', fontSize: '11px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Override:</span>
              <button
                type="button"
                className={`btn btn-sm ${adaptiveState?.mode === 'AUTO' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.15rem 0.4rem', fontSize: '10.5px' }}
                onClick={() => setTransmissionMode('AUTO')}
              >
                Auto
              </button>
              <button
                type="button"
                className={`btn btn-sm ${adaptiveState?.mode === 'MANUAL' && adaptiveState?.profile === 'ULTRA' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.15rem 0.4rem', fontSize: '10.5px' }}
                onClick={() => setTransmissionMode('MANUAL', 'ULTRA')}
              >
                Ultra
              </button>
              <button
                type="button"
                className={`btn btn-sm ${adaptiveState?.mode === 'MANUAL' && adaptiveState?.profile === 'STANDARD' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.15rem 0.4rem', fontSize: '10.5px' }}
                onClick={() => setTransmissionMode('MANUAL', 'STANDARD')}
              >
                Std
              </button>
              <button
                type="button"
                className={`btn btn-sm ${adaptiveState?.mode === 'MANUAL' && adaptiveState?.profile === 'CONSTRAINED' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.15rem 0.4rem', fontSize: '10.5px' }}
                onClick={() => setTransmissionMode('MANUAL', 'CONSTRAINED')}
              >
                Constrained
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
