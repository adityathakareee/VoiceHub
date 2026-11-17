import React, { useState, useEffect } from 'react';
import { roomApi, RoomData } from '../services/room';
import { useAuth } from '../context/AuthContext';
import { useAudioSession } from '../context/AudioSessionContext';
import { AudioConferencePanel } from '../components/AudioConferencePanel';
import { roomPresenceClient, PresenceEventMessage } from '../services/roomPresenceClient';
import { Icons } from '../components/Icons';

interface RoomDetailViewProps {
  roomCode: string;
  onNavigateBack?: () => void;
}

export const RoomDetailView: React.FC<RoomDetailViewProps> = ({ roomCode, onNavigateBack }) => {
  const { user } = useAuth();
  const { stopAudio, activeRoomCode } = useAudioSession();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Copy code feedback state
  const [copied, setCopied] = useState(false);

  // Owner Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMaxParticipants, setEditMaxParticipants] = useState(10);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchRoomDetails = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await roomApi.getRoom(roomCode);
      if (res.room) {
        setRoom(res.room);
        setEditName(res.room.name);
        setEditDescription(res.room.description || '');
        setEditMaxParticipants(res.room.maxParticipants);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load room details';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomDetails();
  }, [roomCode]);

  // Phase 6: Real-Time Participant State & Presence Synchronization
  const [presenceConnected, setPresenceConnected] = useState(false);

  useEffect(() => {
    if (!room || room.status !== 'ACTIVE') {
      roomPresenceClient.disconnect();
      setPresenceConnected(false);
      return;
    }

    roomPresenceClient.connect(room.roomCode);

    const handlePresenceEvent = (event: PresenceEventMessage) => {
      if (event.type === 'CONNECTION_STATE') {
        setPresenceConnected(event.state === 'CONNECTED');
      } else if (event.type === 'ROOM_SYNC' && event.participants) {
        setRoom((prev) => {
          if (!prev) return prev;
          const currentParts = [...(prev.participants || [])];
          event.participants!.forEach((p) => {
            const idx = currentParts.findIndex((cp) => cp.id === p.userId);
            if (idx >= 0) {
              currentParts[idx] = {
                ...currentParts[idx],
                isMuted: p.isMuted,
                isSpeaking: p.isSpeaking,
                online: true,
              };
            } else {
              currentParts.push({
                id: p.userId,
                firstName: p.firstName,
                lastName: p.lastName,
                role: p.role,
                joinedAt: p.joinedAt,
                isMuted: p.isMuted,
                isSpeaking: p.isSpeaking,
                online: true,
              });
            }
          });
          return {
            ...prev,
            participants: currentParts,
            participantCount: currentParts.length,
          };
        });
      } else if (event.type === 'PARTICIPANT_JOINED' && event.participant) {
        setRoom((prev) => {
          if (!prev) return prev;
          const exists = prev.participants?.some((p) => p.id === event.participant!.userId);
          if (exists) return prev;
          const updated = [
            ...(prev.participants || []),
            {
              id: event.participant!.userId,
              firstName: event.participant!.firstName,
              lastName: event.participant!.lastName,
              role: event.participant!.role,
              joinedAt: event.participant!.joinedAt,
              isMuted: event.participant!.isMuted,
              isSpeaking: event.participant!.isSpeaking,
              online: true,
            },
          ];
          return {
            ...prev,
            participants: updated,
            participantCount: updated.length,
          };
        });
      } else if (event.type === 'PARTICIPANT_LEFT' && event.userId) {
        setRoom((prev) => {
          if (!prev) return prev;
          const updated = (prev.participants || []).filter((p) => p.id !== event.userId);
          return {
            ...prev,
            participants: updated,
            participantCount: updated.length,
          };
        });
      } else if (event.type === 'PARTICIPANT_MUTED') {
        setRoom((prev) => {
          if (!prev) return prev;
          const updated = (prev.participants || []).map((p) =>
            p.id === event.userId ? { ...p, isMuted: !!event.isMuted } : p
          );
          return { ...prev, participants: updated };
        });
      } else if (event.type === 'PARTICIPANT_SPEAKING') {
        setRoom((prev) => {
          if (!prev) return prev;
          const updated = (prev.participants || []).map((p) =>
            p.id === event.userId ? { ...p, isSpeaking: !!event.isSpeaking } : p
          );
          return { ...prev, participants: updated };
        });
      }
    };

    roomPresenceClient.addListener(handlePresenceEvent);
    return () => {
      roomPresenceClient.removeListener(handlePresenceEvent);
    };
  }, [room?.roomCode, room?.status]);

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      const res = await roomApi.updateRoom(room.roomCode, {
        name: editName.trim(),
        description: editDescription.trim(),
        maxParticipants: editMaxParticipants,
      });
      if (res.room) {
        setRoom(res.room);
        setIsEditing(false);
        setSuccessMessage('Room configuration updated successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update room');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Cleanup audio if room becomes inactive
  useEffect(() => {
    if (room && room.status !== 'ACTIVE' && activeRoomCode === room.roomCode) {
      stopAudio();
    }
  }, [room?.status, activeRoomCode, stopAudio]);

  const handleLeaveRoom = async () => {
    if (!room) return;
    if (!window.confirm('Are you sure you want to exit this conference room?')) return;
    try {
      setIsActionLoading(true);
      if (activeRoomCode === room.roomCode) {
        stopAudio();
      }
      await roomApi.leaveRoom(room.roomCode);
      if (onNavigateBack) onNavigateBack();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to leave room');
      setIsActionLoading(false);
    }
  };

  const handleCloseRoom = async () => {
    if (!room) return;
    if (!window.confirm('Warning: Closing this room will terminate all active audio sessions. Continue?')) return;
    try {
      setIsActionLoading(true);
      if (activeRoomCode === room.roomCode) {
        stopAudio();
      }
      const res = await roomApi.closeRoom(room.roomCode);
      if (res.room) {
        setRoom(res.room);
        setSuccessMessage('Conference room has been officially closed.');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to close room');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card" style={{ padding: '3.5rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          Loading conference session <strong>{roomCode}</strong>...
        </p>
      </div>
    );
  }

  if (errorMessage && !room) {
    return (
      <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--color-danger)', fontSize: '24px', marginBottom: '0.5rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Room Not Accessible
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>{errorMessage}</p>
        {onNavigateBack && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateBack}>
            ← Return to Rooms
          </button>
        )}
      </div>
    );
  }

  if (!room) return null;

  const isOwner = room.isOwner || (user && room.owner.id === user.id);
  const isActive = room.status === 'ACTIVE';

  return (
    <div className="room-detail-view">
      {/* Top Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        {onNavigateBack && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateBack}>
            ← Back to Rooms
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${presenceConnected ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10.5px' }}>
            ● Presence: {presenceConnected ? 'Synchronized' : 'Connecting'}
          </span>
          <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10.5px' }}>
            ● {room.status}
          </span>
        </div>
      </div>

      {/* Feedback Alerts */}
      {successMessage && (
        <div className="alert alert-info mb-4">
          <Icons.Check size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error mb-4">
          <Icons.AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Room Information Banner */}
      <div className="card mb-6" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {room.name}
              </h1>
              {/* Copyable Room Code Badge */}
              <button
                type="button"
                onClick={handleCopyCode}
                className="badge badge-info"
                style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '0.25rem 0.55rem' }}
                title="Click to copy Room Code"
              >
                {room.roomCode} {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            {room.description && (
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '0.35rem', maxWidth: '720px' }}>
                {room.description}
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.65rem' }}>
              <span>👥 Participants: <strong>{room.participantCount} / {room.maxParticipants}</strong></span>
              <span>Host: <strong>{room.owner.firstName} {room.owner.lastName}</strong> ({room.owner.role})</span>
            </div>
          </div>

          {/* Room Controls (Leave / Edit / Close) */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isOwner && isActive && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? 'Cancel Edit' : 'Edit Room'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleCloseRoom}
                  disabled={isActionLoading}
                >
                  Close Room
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleLeaveRoom}
              disabled={isActionLoading}
            >
              Exit Room
            </button>
          </div>
        </div>

        {/* Edit Room Modal / Accordion */}
        {isEditing && (
          <form onSubmit={handleSaveEdit} style={{ background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Edit Conference Room Settings
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label className="form-label">Room Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Max Participants</label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  className="form-control"
                  value={editMaxParticipants}
                  onChange={(e) => setEditMaxParticipants(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isActionLoading}>
                {isActionLoading ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        )}

        {/* Integrated Real-Time Audio Subsystem */}
        <AudioConferencePanel roomCode={room.roomCode} isRoomActive={isActive} />
      </div>

      {/* Participants Roster Section */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Icons.Rooms size={16} /> Active Participants
            </h2>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
              {room.participants?.length || 0} Online
            </span>
          </div>

          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Real-time speaking wave detection via ScriptProcessorNode
          </span>
        </div>

        {room.participants && room.participants.length > 0 ? (
          <div className="participants-grid">
            {room.participants.map((p) => {
              const isCurrentUser = user && p.id === user.id;
              const isSpeaking = !!p.isSpeaking;
              const isMuted = !!p.isMuted;

              return (
                <div
                  key={p.id}
                  className={`participant-card ${isSpeaking ? 'speaking' : ''}`}
                >
                  <div className="participant-avatar-lg">
                    {p.firstName?.charAt(0) || 'U'}{p.lastName?.charAt(0) || ''}
                    {isSpeaking && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-4px',
                          right: '-4px',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: 'var(--color-success)',
                          border: '2px solid #FFFFFF',
                        }}
                      />
                    )}
                  </div>

                  <div className="participant-name-text">
                    {p.firstName} {p.lastName} {isCurrentUser && <span style={{ color: 'var(--brand-primary)', fontSize: '11px' }}>(You)</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '9.5px', padding: '0.1rem 0.35rem' }}>
                      {p.role}
                    </span>
                    <span className={`badge ${isMuted ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '9.5px', padding: '0.1rem 0.35rem' }}>
                      {isMuted ? '🔇 Muted' : '🎙️ Active'}
                    </span>
                  </div>

                  <div className="participant-status-tag">
                    <span className="pulse-dot" style={isSpeaking ? { background: 'var(--brand-primary)' } : {}} />
                    <span>{isSpeaking ? 'Speaking Now' : 'Listening'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No participants currently detected in this room.
          </div>
        )}
      </div>
    </div>
  );
};
