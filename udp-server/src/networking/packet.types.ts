export enum UdpPacketType {
  REGISTER = 'REGISTER',
  REGISTER_ACK = 'REGISTER_ACK',
  PING = 'PING',
  PONG = 'PONG',
  DATA = 'DATA',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  LEAVE = 'LEAVE',
  ERROR = 'ERROR',
  METRICS = 'METRICS',
  RATE_CONTROL = 'RATE_CONTROL',
}

export type NetworkQualityRating = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

export type TransmissionProfile = 'ULTRA' | 'HIGH' | 'STANDARD' | 'CONSTRAINED' | 'CRITICAL';

export interface AdaptiveRateState {
  mode: 'AUTO' | 'MANUAL';
  profile: TransmissionProfile;
  targetBitrateKbps: number;
  frameIntervalMs: number;
  fecActive: boolean;
  fecRecoveredCount: number;
  targetPlayoutDelayMs: number;
  reason: string;
  lastAdjustedTimestamp: number;
}

export interface FecAudioPayload {
  redundantSequence?: number;
  redundantPcm?: string;
}

export interface NetworkTelemetry {
  rttMs: number;
  jitterMs: number;
  packetLossPercent: number;
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  bytesSent: number;
  bytesReceived: number;
  bitrateUpKbps: number;
  bitrateDownKbps: number;
  qualityRating: NetworkQualityRating;
  timestamp: number;
}

export interface UdpPacket {
  version: number;
  type: UdpPacketType;
  sessionId?: string;
  clientId?: string;
  roomCode?: string;
  token?: string;
  sequence?: number;
  timestamp: number;
  payload?: unknown;
  error?: string;
}

export interface UdpClientSession {
  sessionId: string;
  clientId: string;
  userId: string;
  role: string;
  roomCode: string;
  address: string;
  port: number;
  lastSeen: number;
  lastSequence: number;
  connectedAt: number;
}

