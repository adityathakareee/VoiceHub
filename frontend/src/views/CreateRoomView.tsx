import React, { useState } from 'react';
import { roomApi, RoomData } from '../services/room';
import { Icons } from '../components/Icons';

interface CreateRoomViewProps {
  onRoomCreated?: (roomCode: string) => void;
  onCancel?: () => void;
}

export const CreateRoomView: React.FC<CreateRoomViewProps> = ({ onRoomCreated, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number>(10);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<RoomData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Room name must be at least 2 characters long.');
      return;
    }

    if (maxParticipants < 2 || maxParticipants > 50) {
      setErrorMessage('Maximum participants must be between 2 and 50.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await roomApi.createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        maxParticipants,
      });

      if (res.room) {
        setCreatedRoom(res.room);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create room';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (createdRoom?.roomCode) {
      navigator.clipboard.writeText(createdRoom.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="create-room-view" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="card" style={{ background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-accent)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Plus size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Host a Conference Room
            </h1>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Configure a multi-user audio session with isolated UDP multicast routing.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="alert alert-error my-4">
            <Icons.AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {createdRoom ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', margin: '1rem 0' }}>
            <div style={{ color: 'var(--color-success)', fontSize: '28px', marginBottom: '0.35rem' }}>✓</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Conference Room Initialized!
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Share this unique formatted code with participants to grant entry into your session.
            </p>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--brand-primary)',
                background: '#FFFFFF',
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid #BFDBFE',
                display: 'inline-block',
                marginBottom: '1.5rem',
                letterSpacing: '0.06em',
              }}
            >
              {createdRoom.roomCode}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                id="copy-room-code-btn"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyCode}
              >
                <Icons.Copy size={14} />
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Room Code'}</span>
              </button>

              {onRoomCreated && (
                <button
                  type="button"
                  id="open-room-btn"
                  className="btn btn-primary btn-sm"
                  onClick={() => onRoomCreated(createdRoom.roomCode)}
                >
                  Enter Conference Room →
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="room-name-input" className="form-label">
                Conference Room Name <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                id="room-name-input"
                type="text"
                className="form-control"
                placeholder="e.g. Computer Networks Laboratory Discussion"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                required
                minLength={2}
                maxLength={100}
              />
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                A descriptive title for your conference session.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="room-desc-input" className="form-label">
                Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                id="room-desc-input"
                className="form-control"
                placeholder="e.g. Capstone design review, audio testing, and rate control demonstration"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="form-group">
              <label htmlFor="room-capacity-input" className="form-label">
                Maximum Participants Allowed
              </label>
              <input
                id="room-capacity-input"
                type="number"
                className="form-control"
                min={2}
                max={50}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10) || 10)}
                disabled={isLoading}
              />
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Maximum concurrent audio streams allowed (Range: 2 to 50, Default: 10).
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              {onCancel && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              )}
              <button
                id="submit-create-room-btn"
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isLoading}
              >
                {isLoading ? 'Creating Room...' : 'Create Room'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
