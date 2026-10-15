import React from 'react';
import { LayersIcon, ServerIcon, RadioIcon, ShieldCheckIcon, CheckCircle2Icon } from './Icons';

export const ArchitectureView: React.FC = () => {
  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">System Architecture & Protocol Specifications</h1>
          <p className="view-subtitle">
            Formal separation of control plane (REST/WebSocket) and data plane (UDP/PCM Audio Engine).
          </p>
        </div>
      </div>

      <div className="grid-2 mb-6">
        {/* Signaling Plane */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-group">
              <ServerIcon size={18} className="text-primary" />
              <h2 className="card-title">Control & Signaling Plane (TCP)</h2>
            </div>
            <span className="badge badge-success">Port 5000 / WS</span>
          </div>
          <div className="card-body">
            <div className="arch-stack">
              <div className="arch-layer">
                <span className="arch-layer-title">React Client Application (Vite + TypeScript)</span>
                <span className="arch-layer-desc">SPA hosting state machine, Web Audio API, and real-time telemetry HUD</span>
              </div>
              <div className="arch-arrow">↓ JSON REST APIs & WebSocket Protocols</div>
              <div className="arch-layer">
                <span className="arch-layer-title">Express Signaling Server (Node.js)</span>
                <span className="arch-layer-desc">JWT authentication, room lifecycle, membership validation, and rate limiting</span>
              </div>
              <div className="arch-arrow">↓ Mongoose ODM & Session State</div>
              <div className="arch-layer">
                <span className="arch-layer-title">MongoDB Persistence Engine (Port 27017)</span>
                <span className="arch-layer-desc">User credentials (bcrypt), rooms collection, active sessions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Media Plane */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-group">
              <RadioIcon size={18} className="text-accent" />
              <h2 className="card-title">Media & Audio Transport Plane (UDP)</h2>
            </div>
            <span className="badge badge-accent">Port 5001 (UDP) & 5002 (Bridge)</span>
          </div>
          <div className="card-body">
            <div className="arch-stack">
              <div className="arch-layer">
                <span className="arch-layer-title">Browser Audio (Web Audio API)</span>
                <span className="arch-layer-desc">16-bit 16kHz PCM audio capture, dynamic chunk packetization</span>
              </div>
              <div className="arch-arrow">↓ Local IPC / WebSocket Stream</div>
              <div className="arch-layer">
                <span className="arch-layer-title">Companion Bridge (Port 5002)</span>
                <span className="arch-layer-desc">Bridges browser sandbox to native OS UDP sockets; packages JSON frames</span>
              </div>
              <div className="arch-arrow">↓ JSON-serialized UDP Datagrams (Base64 PCM)</div>
              <div className="arch-layer">
                <span className="arch-layer-title">UDP Media Server (Port 5001)</span>
                <span className="arch-layer-desc">High-throughput UDP datagram ingest, RFC 3550 telemetry calculation</span>
              </div>
              <div className="arch-arrow">↓ Room Multicast & Selective Forwarding</div>
              <div className="arch-layer">
                <span className="arch-layer-title">Room Routing & Distribution</span>
                <span className="arch-layer-desc">Multi-tenant room isolation, sequence tracking, peer dispatch</span>
              </div>
              <div className="arch-arrow">↓ Egress UDP Datagrams</div>
              <div className="arch-layer">
                <span className="arch-layer-title">Receiving Bridge</span>
                <span className="arch-layer-desc">Inbound UDP receiver, jitter buffer, RFC 2198 redundancy reconstruction</span>
              </div>
              <div className="arch-arrow">↓ Dynamic Playout Stream</div>
              <div className="arch-layer">
                <span className="arch-layer-title">Audio Playback</span>
                <span className="arch-layer-desc">Dynamic jitter buffer playout clamp, Web Audio PCM playback</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Wire Datagram Schema Card */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title-group">
            <LayersIcon size={18} className="text-primary" />
            <h2 className="card-title">UDP Wire Datagram Protocol Schema</h2>
          </div>
          <span className="badge badge-info">JSON-Serialized Datagrams • Base64 PCM</span>
        </div>
        <div className="card-body">
          <p className="text-secondary text-sm mb-3">
            Audio transport operates over raw UDP datagrams containing structured JSON frames with Base64-encoded PCM payloads. Telemetry calculation adheres to RFC 3550 statistical jitter and loss tracking, while forward error correction utilizes RFC 2198-inspired application-level redundant audio framing.
          </p>

          <div
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              overflowX: 'auto',
            }}
          >
            <pre style={{ margin: 0 }}>
{`{
  "version": 1,
  "type": "DATA",                      // PING | PONG | DATA | FEC | REGISTER | HEARTBEAT
  "roomId": "CVH-7K4P2M",              // Isolated room identifier
  "userId": "usr-8a9f2c...",           // Authenticated participant identifier
  "seq": 1042,                         // Monotonically increasing sequence number
  "timestamp": 1728394800120,          // High-resolution millisecond timestamp
  "payload": {
    "pcm": "Bw4FBQcDAwIA...",          // Base64-encoded PCM16 / PCM8 audio chunk
    "format": "pcm16",                 // "pcm16" (uncompressed) or "pcm8" (companded)
    "sampleRate": 16000                // 16 kHz mono sampling frequency
  },
  "fec": {
    "redundantSeq": 1041,              // RFC 2198-inspired piggybacked prior frame sequence
    "pcm": "AAEEBw..."                 // Companded 8-bit previous frame for MTU-safe recovery
  }
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Security and Academic Constraints */}
      <div className="card">
        <div className="card-header">
          <div className="card-title-group">
            <ShieldCheckIcon size={18} className="text-success" />
            <h2 className="card-title">Architectural Rationale & Academic Design Principles</h2>
          </div>
        </div>
        <div className="card-body">
          <div className="specs-list">
            <div className="spec-row">
              <CheckCircle2Icon size={16} className="text-success" />
              <div>
                <strong>Sandbox Isolation & Companion UDP Bridge:</strong> Web browser JavaScript cannot directly construct raw UDP dgram sockets due to browser sandbox boundaries. CSE Voice Hub utilizes a high-performance local companion bridge on port 5002 to maintain genuine raw UDP transmission.
              </div>
            </div>
            <div className="spec-row">
              <CheckCircle2Icon size={16} className="text-success" />
              <div>
                <strong>Strict Channel Decoupling:</strong> Heavy media streaming over UDP never interferes with signaling and presence state management on WebSocket/REST, avoiding head-of-line blocking.
              </div>
            </div>
            <div className="spec-row">
              <CheckCircle2Icon size={16} className="text-success" />
              <div>
                <strong>MTU-Safety & Redundancy Pacing:</strong> All audio packets conform to 1200-byte clamped limits with primary and RFC 2198 redundant audio payload companding, preventing IP fragmentation across networks.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
