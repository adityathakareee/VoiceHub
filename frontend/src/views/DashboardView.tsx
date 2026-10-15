import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { roomApi, RoomData } from '../services/room';
import { audioBridgeClient, NetworkMetrics, AdaptiveState } from '../services/audioBridgeClient';
import { fetchSystemHealth, HealthApiResponse } from '../services/api';
import { Icons } from '../components/Icons';

interface DashboardViewProps {
  onNavigateToProfile: () => void;
  onNavigateToCreateRoom: () => void;
  onOpenRoom: (roomCode: string) => void;
  onNavigateToNetworkMonitor?: () => void;
  onNavigateToAdaptiveTransport?: () => void;
  onNavigateToLogin?: () => void;
  onNavigateToRegister?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToProfile,
  onNavigateToCreateRoom,
  onOpenRoom,
  onNavigateToNetworkMonitor,
  onNavigateToAdaptiveTransport,
  onNavigateToLogin,
  onNavigateToRegister,
}) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  // Quick Join State
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // System Health state
  const [healthData, setHealthData] = useState<HealthApiResponse | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState<boolean>(false);

  // Telemetry & Adaptive state from live bridge client
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(audioBridgeClient.latestMetrics);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState | null>(audioBridgeClient.latestAdaptiveState);

  const fetchRooms = async () => {
    if (!user) {
      setRooms([]);
      setIsLoadingRooms(false);
      return;
    }
    try {
      setIsLoadingRooms(true);
      const res = await roomApi.getMyRooms();
      if (res.rooms) {
        setRooms(res.rooms);
      }
    } catch (err) {
      console.error('Failed to load user rooms:', err);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRooms();
    } else {
      setRooms([]);
      setIsLoadingRooms(false);
    }

    // Check system health
    fetchSystemHealth().then((res) => {
      if (res.data) setHealthData(res.data);
    });

    setBridgeConnected(audioBridgeClient.isConnected);

    // Listen for live bridge updates
    const handleBridgeMessage = (data: any) => {
      if (data.type === 'NETWORK_METRICS' && data.metrics) {
        setMetrics(data.metrics);
      }
      if (data.type === 'ADAPTIVE_STATE_UPDATE' && data.adaptiveState) {
        setAdaptiveState(data.adaptiveState);
      }
      if (data.type === 'SESSION_STATUS') {
        setBridgeConnected(data.status === 'REGISTERED');
      }
    };

    audioBridgeClient.addMessageListener(handleBridgeMessage);
    return () => {
      audioBridgeClient.removeMessageListener(handleBridgeMessage);
    };
  }, [user]);

  const handleQuickJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    if (!joinCodeInput.trim()) {
      setJoinError('Please enter a valid room code.');
      return;
    }

    if (!user) {
      if (onNavigateToLogin) {
        onNavigateToLogin();
      } else {
        setJoinError('Please sign in to join a conference room.');
      }
      return;
    }

    try {
      setIsJoining(true);
      const res = await roomApi.joinRoom(joinCodeInput.trim());
      if (res.room) {
        onOpenRoom(res.room.roomCode);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join room';
      setJoinError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="dashboard-view-container">
      {/* 1. Academic Project Header Banner */}
      <div className="card mb-6" style={{ background: '#FFFFFF', borderLeft: '4px solid var(--brand-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '11px', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              <span>Computer Engineering Department</span>
              <span>•</span>
              <span>Course Capstone System</span>
            </div>
            <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
              {user ? `Welcome back, ${user.firstName} ${user.lastName}` : 'CSE Voice Hub'}
            </h1>
            <p className="page-subtitle" style={{ fontSize: '13.5px', maxWidth: '820px' }}>
              Real-time multi-user audio conferencing with adaptive packetization, network telemetry, RFC 2198-inspired redundant audio framing and dynamic playout delay.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {user ? (
              <>
                <span className="badge badge-info" style={{ fontSize: '11.5px', padding: '0.35rem 0.65rem' }}>
                  <Icons.Shield size={13} /> Role: {user.role}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onNavigateToProfile}
                  title="Manage Profile"
                >
                  <Icons.User size={13} /> Settings
                </button>
              </>
            ) : (
              <>
                {onNavigateToLogin && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onNavigateToLogin}
                  >
                    Sign In
                  </button>
                )}
                {onNavigateToRegister && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onNavigateToRegister}
                  >
                    Register Account
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. System Status Strip (Real State) */}
      <div className="status-strip">
        <div className="status-strip-item">
          <span className="status-strip-name">Backend API (:5000)</span>
          <span className={`status-strip-badge ${healthData ? 'text-success' : 'text-muted'}`}>
            <span className={`pulse-dot ${healthData ? '' : 'pulse-warning'}`} />
            {healthData ? 'Online' : 'Checking...'}
          </span>
        </div>

        <div className="status-strip-item">
          <span className="status-strip-name">UDP Server (:5001)</span>
          <span className="status-strip-badge text-muted">
            <span className="pulse-dot pulse-warning" /> Configured — Port 5001
          </span>
        </div>

        <div className="status-strip-item">
          <span className="status-strip-name">Audio Bridge (:5002)</span>
          <span className={`status-strip-badge ${bridgeConnected ? 'text-success' : 'text-primary'}`}>
            <span className={`pulse-dot ${bridgeConnected ? '' : 'pulse-dot'}`} style={!bridgeConnected ? { background: '#2563EB' } : {}} />
            {bridgeConnected ? 'Connected' : 'Ready'}
          </span>
        </div>

        <div className="status-strip-item">
          <span className="status-strip-name">MongoDB Database</span>
          <span className={`status-strip-badge ${healthData?.database?.status === 'connected' ? 'text-success' : 'text-muted'}`}>
            <span className={`pulse-dot ${healthData?.database?.status === 'connected' ? '' : 'pulse-warning'}`} />
            {healthData?.database?.status === 'connected' ? 'Connected' : 'Active'}
          </span>
        </div>

        <div className="status-strip-item">
          <span className="status-strip-name">WebSocket Control</span>
          <span className={`status-strip-badge ${healthData ? 'text-success' : 'text-muted'}`}>
            <span className={`pulse-dot ${healthData ? '' : 'pulse-warning'}`} />
            {healthData ? 'Ready' : 'Checking...'}
          </span>
        </div>
      </div>

      {/* 3. Real Key Network Performance & Adaptive Transport Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Network Performance Block */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icons.Network size={16} /> Key Network Performance
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>RFC 3550 Real-Time Telemetry</span>
            </div>
            {onNavigateToNetworkMonitor && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onNavigateToNetworkMonitor}
              >
                Inspect Monitor →
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="metric-card">
              <div className="metric-card-label">Round-Trip Time</div>
              <div className="metric-card-value" style={{ color: 'var(--brand-primary)' }}>
                {metrics ? `${metrics.rttMs} ms` : 'N/A'}
              </div>
              <div className="metric-card-sub">{metrics ? 'Smoothed SRTT' : 'Awaiting audio probe'}</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">RFC 3550 Jitter</div>
              <div className="metric-card-value" style={{ color: 'var(--accent-cyan)' }}>
                {metrics ? `${metrics.jitterMs} ms` : 'N/A'}
              </div>
              <div className="metric-card-sub">{metrics ? 'Inter-arrival variance' : 'Awaiting stream'}</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Packet Loss</div>
              <div className="metric-card-value" style={{ color: metrics ? ((metrics.packetLossPercent > 2) ? 'var(--color-danger)' : 'var(--color-success)') : 'var(--text-muted)' }}>
                {metrics ? `${metrics.packetLossPercent}%` : 'N/A'}
              </div>
              <div className="metric-card-sub">{metrics ? 'Sequence gap tracking' : 'No stream active'}</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Channel Quality</div>
              <div className="metric-card-value" style={{ fontSize: '1.15rem', color: metrics ? 'var(--color-success)' : 'var(--text-muted)' }}>
                {metrics?.qualityRating || 'Waiting for stream'}
              </div>
              <div className="metric-card-sub">E-Model inspired band</div>
            </div>
          </div>
        </div>

        {/* Adaptive Transport Block */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icons.Adaptive size={16} /> Adaptive UDP Rate Control
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AIMD Elastic Packetization Subsystem</span>
            </div>
            {onNavigateToAdaptiveTransport && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onNavigateToAdaptiveTransport}
              >
                View Engine →
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="metric-card">
              <div className="metric-card-label">Active Profile</div>
              <div className="metric-card-value" style={{ color: 'var(--brand-primary)', fontSize: '1.35rem' }}>
                {adaptiveState?.profile || 'Idle / Standby'}
              </div>
              <div className="metric-card-sub">{adaptiveState ? `${adaptiveState.targetBitrateKbps} kbps Target` : 'Idle / Standby'}</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Frame Duration</div>
              <div className="metric-card-value" style={{ color: 'var(--text-primary)' }}>
                {adaptiveState ? `${adaptiveState.frameIntervalMs} ms` : 'Idle'}
              </div>
              <div className="metric-card-sub">Dynamic slice size</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Redundancy / FEC Status</div>
              <div className="metric-card-value" style={{ fontSize: '1.1rem', color: adaptiveState?.fecActive ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {adaptiveState ? (adaptiveState.fecActive ? 'ACTIVE (Loss > 2%)' : 'INACTIVE (Loss < 2%)') : 'Standby'}
              </div>
              <div className="metric-card-sub">RFC 2198 Redundancy</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Playout Delay</div>
              <div className="metric-card-value" style={{ color: 'var(--brand-secondary)' }}>
                {adaptiveState ? `${adaptiveState.targetPlayoutDelayMs} ms` : 'N/A'}
              </div>
              <div className="metric-card-sub">Jitter buffer clamp</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Adaptation Architecture Flow Strip */}
      <div className="card mb-6" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '0.9rem', marginBottom: 0 }}>
            <Icons.Architecture size={15} /> Closed-Loop Adaptive Control Pipeline
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MTU: $\le 1200$ Bytes Clamped</span>
        </div>

        <div className="pipeline-flow">
          <div className="pipeline-step active">
            1. Network Telemetry
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>RTT • Jitter • Loss %</div>
          </div>
          <span className="pipeline-arrow">→</span>

          <div className="pipeline-step">
            2. AIMD Controller
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>Hysteresis Deadband</div>
          </div>
          <span className="pipeline-arrow">→</span>

          <div className="pipeline-step active">
            3. Profile Selection
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>16k - 96k Bitrate Pacing</div>
          </div>
          <span className="pipeline-arrow">→</span>

          <div className="pipeline-step">
            4. Dynamic Framing & RFC 2198 Redundancy
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>15ms - 40ms + Redundancy</div>
          </div>
          <span className="pipeline-arrow">→</span>

          <div className="pipeline-step active">
            5. Dynamic Playout Buffer
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>20ms - 200ms Jitter Clamp</div>
          </div>
        </div>
      </div>

      {/* 5. Conference Room Actions: Create & Quick Join */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Host Room Box */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-accent)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Plus size={16} />
              </div>
              <h2 className="card-title">Host a Conference Room</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Create an isolated conference room, receive a unique formatted room code (e.g. CVH-7K4P2M), and invite departmental peers.
            </p>
          </div>
          <button
            id="dashboard-create-room-btn"
            type="button"
            className="btn btn-primary"
            onClick={user ? onNavigateToCreateRoom : (onNavigateToLogin || onNavigateToCreateRoom)}
          >
            {user ? '+ Create Conference Room' : 'Sign In to Host Room →'}
          </button>
        </div>

        {/* Enter Code Box */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.Shield size={16} />
              </div>
              <h2 className="card-title">Enter Room Code</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Enter an existing 10-character conference room code to join an active session.
            </p>
          </div>

          <form onSubmit={handleQuickJoinSubmit}>
            {joinError && (
              <div className="alert alert-error" style={{ padding: '0.5rem', fontSize: '12px', marginBottom: '0.5rem' }}>
                {joinError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="join-code-input"
                type="text"
                className="form-control"
                placeholder="e.g. CVH-7K4P2M"
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                disabled={isJoining}
                required
              />
              <button
                id="join-code-submit-btn"
                type="submit"
                className="btn btn-primary"
                disabled={isJoining}
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 6. Real Conference Rooms Table / Grid */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 className="card-title">Conference Rooms</h2>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>{rooms.length} Total</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchRooms}
            title="Refresh Rooms"
          >
            <Icons.Refresh size={13} /> Refresh
          </button>
        </div>

        {isLoadingRooms ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ fontSize: '13px' }}>Loading active conference rooms...</p>
          </div>
        ) : rooms.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {room.name}
                    </h3>
                    <span className={`badge ${room.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>
                      {room.status}
                    </span>
                  </div>

                  {room.description && (
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                      {room.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-subtle)', padding: '0.1rem 0.4rem', borderRadius: '3px', color: 'var(--brand-primary)', fontWeight: 600 }}>
                      {room.roomCode}
                    </span>
                    <span>
                      👥 {room.participantCount} / {room.maxParticipants} Active
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onOpenRoom(room.roomCode)}
                  >
                    Enter Room →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : !user ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-accent)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Icons.Rooms size={22} />
            </div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Institutional Conference Access
            </p>
            <p style={{ fontSize: '13px', maxWidth: '480px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
              Sign in with your academic credentials to view active conference sessions, create private rooms, and stream real-time UDP audio.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              {onNavigateToLogin && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onNavigateToLogin}
                >
                  Sign In
                </button>
              )}
              {onNavigateToRegister && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={onNavigateToRegister}
                >
                  Create Account
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              No conference rooms active yet
            </p>
            <p style={{ fontSize: '12.5px', marginBottom: '1rem' }}>
              Host a conference room above or enter a shared room code to participate.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNavigateToCreateRoom}
            >
              + Create First Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
