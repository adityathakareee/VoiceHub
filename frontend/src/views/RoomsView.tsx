import React, { useState, useEffect } from 'react';
import { roomApi, RoomData } from '../services/room';
import { Icons } from '../components/Icons';

interface RoomsViewProps {
  onOpenRoom: (roomCode: string) => void;
  onNavigateToCreateRoom: () => void;
}

export const RoomsView: React.FC<RoomsViewProps> = ({
  onOpenRoom,
  onNavigateToCreateRoom,
}) => {
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const res = await roomApi.getMyRooms();
      if (res.rooms) {
        setRooms(res.rooms);
      }
    } catch (err) {
      console.error('Failed to load conference rooms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleQuickJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    if (!joinCodeInput.trim()) {
      setJoinError('Please enter a valid room code.');
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

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.roomCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="rooms-view">
      {/* Page Header */}
      <div className="page-header mb-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Icons.Rooms size={24} /> Conference Rooms
            </h1>
            <p className="page-subtitle">
              Isolated multi-user voice conference sessions with in-memory UDP routing and presence synchronization.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchRooms}
              title="Refresh Room List"
            >
              <Icons.Refresh size={13} /> Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNavigateToCreateRoom}
            >
              + Create New Room
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Quick Join Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Search Filter */}
        <div className="card" style={{ padding: '0.85rem 1rem' }}>
          <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Search Available Rooms
          </label>
          <input
            type="text"
            className="form-control"
            placeholder="Filter by title or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Direct Join with Code */}
        <div className="card" style={{ padding: '0.85rem 1rem' }}>
          <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Direct Room Code Join
          </label>
          <form onSubmit={handleQuickJoinSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. CVH-7K4P2M"
              style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              disabled={isJoining}
              required
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isJoining}
            >
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </form>
          {joinError && (
            <div style={{ color: 'var(--color-danger)', fontSize: '11.5px', marginTop: '0.35rem' }}>
              {joinError}
            </div>
          )}
        </div>
      </div>

      {/* Conference Rooms Grid */}
      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '13px' }}>Loading conference rooms from database...</p>
        </div>
      ) : filteredRooms.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredRooms.map((room) => (
            <div
              key={room.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {room.name}
                  </h3>
                  <span
                    className={`badge ${room.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}
                    style={{ fontSize: '10px' }}
                  >
                    ● {room.status}
                  </span>
                </div>

                {room.description && (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
                    {room.description}
                  </p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-accent)',
                      color: 'var(--brand-primary)',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #BFDBFE',
                    }}
                  >
                    {room.roomCode}
                  </span>

                  <span>
                    👥 <strong>{room.participantCount}</strong> / {room.maxParticipants} Participants
                  </span>

                  <span>
                    Host: <strong>{room.owner.firstName} {room.owner.lastName}</strong>
                  </span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenRoom(room.roomCode)}
                >
                  Enter Conference →
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            No matching conference rooms found
          </p>
          <p style={{ fontSize: '13px', marginBottom: '1.25rem' }}>
            Host a new conference room to get started or clear your search filter.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNavigateToCreateRoom}
          >
            + Host New Room
          </button>
        </div>
      )}
    </div>
  );
};
