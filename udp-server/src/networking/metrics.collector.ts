import { NetworkQualityRating, NetworkTelemetry } from './packet.types';
import { logger } from '../utils/logger';

export interface SessionMetricsState {
  sessionId: string;
  roomCode: string;
  // Sequence & Loss tracking
  lastSequence: number;
  packetsReceived: number;
  packetsLost: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  // RFC 3550 Jitter state
  lastSenderTimestamp: number;
  lastArrivalTimestamp: number;
  jitter: number; // in milliseconds
  // Byte counters
  bytesReceived: number;
  bytesSent: number;
  packetsSent: number;
  // RTT tracking
  lastRttMs: number;
  smoothedRttMs: number;
  // Rolling window throughput
  windowStartTime: number;
  windowBytesSent: number;
  windowBytesReceived: number;
  bitrateUpKbps: number;
  bitrateDownKbps: number;
}

export class UdpMetricsCollector {
  private sessions: Map<string, SessionMetricsState> = new Map();
  private roomMetrics: Map<string, { packetsTotal: number; bytesTotal: number }> = new Map();

  /**
   * Initializes or gets the metrics state for a session
   */
  public getOrCreateSessionMetrics(sessionId: string, roomCode: string): SessionMetricsState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      const now = Date.now();
      state = {
        sessionId,
        roomCode,
        lastSequence: 0,
        packetsReceived: 0,
        packetsLost: 0,
        duplicatePackets: 0,
        outOfOrderPackets: 0,
        lastSenderTimestamp: 0,
        lastArrivalTimestamp: 0,
        jitter: 0,
        bytesReceived: 0,
        bytesSent: 0,
        packetsSent: 0,
        lastRttMs: 0,
        smoothedRttMs: 0,
        windowStartTime: now,
        windowBytesSent: 0,
        windowBytesReceived: 0,
        bitrateUpKbps: 0,
        bitrateDownKbps: 0,
      };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /**
   * Records an incoming packet for sequence, loss, jitter, and byte tracking
   */
  public recordIncomingPacket(params: {
    sessionId: string;
    roomCode: string;
    sequence: number;
    senderTimestamp: number;
    arrivalTimestamp?: number;
    byteSize: number;
  }): { isDuplicate: boolean; isOutOfOrder: boolean; lostCount: number } {
    const arrivalTime = params.arrivalTimestamp || Date.now();
    const state = this.getOrCreateSessionMetrics(params.sessionId, params.roomCode);

    state.packetsReceived += 1;
    state.bytesReceived += params.byteSize;
    state.windowBytesReceived += params.byteSize;

    let isDuplicate = false;
    let isOutOfOrder = false;
    let lostCount = 0;

    // 1. Sequence & Loss Tracking
    if (state.lastSequence > 0) {
      if (params.sequence === state.lastSequence) {
        isDuplicate = true;
        state.duplicatePackets += 1;
      } else if (params.sequence < state.lastSequence) {
        isOutOfOrder = true;
        state.outOfOrderPackets += 1;
      } else if (params.sequence > state.lastSequence + 1) {
        // Gap detected: packets were dropped in transit
        lostCount = params.sequence - state.lastSequence - 1;
        state.packetsLost += lostCount;
        isOutOfOrder = true;
        state.outOfOrderPackets += 1;
      }
    }

    if (params.sequence > state.lastSequence) {
      state.lastSequence = params.sequence;
    }

    // 2. RFC 3550 Inter-Arrival Jitter Calculation
    // D(i-1, i) = (R_i - S_i) - (R_{i-1} - S_{i-1})
    // J_i = J_{i-1} + (|D| - J_{i-1}) / 16
    if (state.lastSenderTimestamp > 0 && state.lastArrivalTimestamp > 0) {
      const transitCurrent = arrivalTime - params.senderTimestamp;
      const transitPrevious = state.lastArrivalTimestamp - state.lastSenderTimestamp;
      const D = Math.abs(transitCurrent - transitPrevious);
      state.jitter = state.jitter + (D - state.jitter) / 16;
    }

    state.lastSenderTimestamp = params.senderTimestamp;
    state.lastArrivalTimestamp = arrivalTime;

    // Update rolling bitrate if window >= 1000ms
    this.refreshRollingBitrate(state, arrivalTime);

    return { isDuplicate, isOutOfOrder, lostCount };
  }

  /**
   * Records an outbound forwarded packet
   */
  public recordOutgoingPacket(sessionId: string, roomCode: string, byteSize: number): void {
    const state = this.getOrCreateSessionMetrics(sessionId, roomCode);
    state.packetsSent += 1;
    state.bytesSent += byteSize;
    state.windowBytesSent += byteSize;
    this.refreshRollingBitrate(state, Date.now());
  }

  /**
   * Records measured RTT from a PING/PONG probe
   */
  public recordRttMeasurement(sessionId: string, roomCode: string, rttMs: number): void {
    const state = this.getOrCreateSessionMetrics(sessionId, roomCode);
    state.lastRttMs = Math.max(0, rttMs);
    if (state.smoothedRttMs === 0) {
      state.smoothedRttMs = state.lastRttMs;
    } else {
      // Exponential moving average (RFC 6298 / TCP SRTT)
      state.smoothedRttMs = 0.8 * state.smoothedRttMs + 0.2 * state.lastRttMs;
    }
  }

  /**
   * Refreshes the rolling throughput bitrate over 1-second intervals
   */
  private refreshRollingBitrate(state: SessionMetricsState, now: number): void {
    const elapsedMs = now - state.windowStartTime;
    if (elapsedMs >= 1000) {
      const elapsedSec = elapsedMs / 1000;
      state.bitrateUpKbps = (state.windowBytesSent * 8) / (1000 * elapsedSec);
      state.bitrateDownKbps = (state.windowBytesReceived * 8) / (1000 * elapsedSec);

      state.windowStartTime = now;
      state.windowBytesSent = 0;
      state.windowBytesReceived = 0;
    }
  }

  /**
   * Evaluates network quality based on RTT, Loss, and Jitter
   */
  public static calculateQualityRating(rttMs: number, jitterMs: number, lossPercent: number): NetworkQualityRating {
    if (rttMs <= 60 && jitterMs <= 15 && lossPercent <= 1.0) {
      return 'EXCELLENT';
    }
    if (rttMs <= 150 && jitterMs <= 30 && lossPercent <= 3.0) {
      return 'GOOD';
    }
    if (rttMs <= 300 && jitterMs <= 60 && lossPercent <= 8.0) {
      return 'FAIR';
    }
    return 'POOR';
  }

  /**
   * Generates a complete NetworkTelemetry snapshot for a session
   */
  public getTelemetry(sessionId: string, roomCode: string): NetworkTelemetry {
    const state = this.getOrCreateSessionMetrics(sessionId, roomCode);
    this.refreshRollingBitrate(state, Date.now());

    const totalExpected = state.packetsReceived + state.packetsLost;
    const lossPercent = totalExpected > 0 ? (state.packetsLost / totalExpected) * 100 : 0.0;
    const effectiveRtt = state.smoothedRttMs || state.lastRttMs;
    const quality = UdpMetricsCollector.calculateQualityRating(effectiveRtt, state.jitter, lossPercent);

    return {
      rttMs: Math.round(effectiveRtt),
      jitterMs: Number(state.jitter.toFixed(2)),
      packetLossPercent: Number(lossPercent.toFixed(2)),
      packetsSent: state.packetsSent,
      packetsReceived: state.packetsReceived,
      packetsLost: state.packetsLost,
      bytesSent: state.bytesSent,
      bytesReceived: state.bytesReceived,
      bitrateUpKbps: Number(state.bitrateUpKbps.toFixed(1)),
      bitrateDownKbps: Number(state.bitrateDownKbps.toFixed(1)),
      qualityRating: quality,
      timestamp: Date.now(),
    };
  }

  /**
   * Removes session metrics state upon disconnect
   */
  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clears all session metrics
   */
  public clear(): void {
    this.sessions.clear();
    this.roomMetrics.clear();
  }
}

export const globalUdpMetricsCollector = new UdpMetricsCollector();
