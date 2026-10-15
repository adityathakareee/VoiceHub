import {
  AdaptiveRateState,
  NetworkTelemetry,
  TransmissionProfile,
} from './packet.types';
import { logger } from '../utils/logger';

export interface TransmissionProfileSpec {
  targetBitrateKbps: number;
  frameIntervalMs: number;
  sampleRate: number;
  description: string;
}

export const TRANSMISSION_PROFILES: Record<TransmissionProfile, TransmissionProfileSpec> = {
  ULTRA: {
    targetBitrateKbps: 96,
    frameIntervalMs: 15,
    sampleRate: 16000,
    description: 'Pristine channel, maximum fidelity uncompressed audio pacing',
  },
  HIGH: {
    targetBitrateKbps: 80,
    frameIntervalMs: 20,
    sampleRate: 16000,
    description: 'High fidelity audio stream with minimal compression overhead',
  },
  STANDARD: {
    targetBitrateKbps: 64,
    frameIntervalMs: 20,
    sampleRate: 16000,
    description: 'Nominal 16kHz Mono PCM16 20ms audio frame stream',
  },
  CONSTRAINED: {
    targetBitrateKbps: 32,
    frameIntervalMs: 25,
    sampleRate: 16000,
    description: 'Throttled frame pacing for congested network conditions',
  },
  CRITICAL: {
    targetBitrateKbps: 16,
    frameIntervalMs: 40,
    sampleRate: 16000,
    description: 'Emergency minimal transmission mode to prevent bufferbloat and packet drops',
  },
};

export class AdaptiveRateController {
  private mode: 'AUTO' | 'MANUAL' = 'AUTO';
  private currentProfile: TransmissionProfile = 'STANDARD';
  private fecActive: boolean = false;
  private fecRecoveredCount: number = 0;
  private targetPlayoutDelayMs: number = 35;
  private reason: string = 'Initialized with nominal standard profile';
  private lastAdjustedTimestamp: number = Date.now();
  private consecutiveExcellentCount: number = 0;

  constructor(initialMode: 'AUTO' | 'MANUAL' = 'AUTO', initialProfile: TransmissionProfile = 'STANDARD') {
    this.mode = initialMode;
    this.currentProfile = initialProfile;
  }

  /**
   * Evaluates incoming real-time network telemetry and adjusts transmission rate
   */
  public evaluateNetworkTelemetry(telemetry: NetworkTelemetry): AdaptiveRateState {
    const now = Date.now();

    // 1. Calculate Adaptive Playout Delay based on Jitter & RTT
    // RFC 3550 playout sizing: buffer delay = clamp(20ms, 200ms, 2.5 * jitter + 0.1 * RTT + 15)
    const computedPlayoutDelay = Math.min(
      200,
      Math.max(20, Math.round(2.5 * telemetry.jitterMs + 0.1 * telemetry.rttMs + 15))
    );
    this.targetPlayoutDelayMs = computedPlayoutDelay;

    // 2. Evaluate Forward Error Correction (FEC) activation
    // If packet loss >= 2.0%, activate FEC redundant frame attachment
    // If packet loss < 1.0%, deactivate FEC to conserve bandwidth
    if (telemetry.packetLossPercent >= 2.0) {
      if (!this.fecActive) {
        this.fecActive = true;
        logger.info(`[ADAPTIVE] FEC Activated: Packet loss ${telemetry.packetLossPercent}% exceeds 2.0% threshold`);
      }
    } else if (telemetry.packetLossPercent < 1.0) {
      if (this.fecActive) {
        this.fecActive = false;
        logger.info(`[ADAPTIVE] FEC Deactivated: Packet loss ${telemetry.packetLossPercent}% is below 1.0% threshold`);
      }
    }

    // 3. If in MANUAL mode, preserve chosen profile
    if (this.mode === 'MANUAL') {
      return this.getState();
    }

    // 4. AUTO mode: Additive Increase / Multiplicative Decrease (AIMD)
    const { packetLossPercent, rttMs, jitterMs, qualityRating } = telemetry;
    let newProfile = this.currentProfile;
    let adjustmentReason = this.reason;

    // Multiplicative Decrease: Severe packet loss or high latency
    if (packetLossPercent > 8.0 || rttMs > 300 || jitterMs > 60 || qualityRating === 'POOR') {
      this.consecutiveExcellentCount = 0;
      if (this.currentProfile !== 'CRITICAL') {
        newProfile = 'CRITICAL';
        adjustmentReason = `Multiplicative Decrease: Severe loss (${packetLossPercent}%) or high RTT (${rttMs}ms) detected`;
      }
    }
    // Moderate Congestion
    else if (packetLossPercent > 3.0 || rttMs > 150 || jitterMs > 30 || qualityRating === 'FAIR') {
      this.consecutiveExcellentCount = 0;
      if (this.currentProfile !== 'CONSTRAINED') {
        newProfile = 'CONSTRAINED';
        adjustmentReason = `Congestion Throttling: Network degraded (Loss: ${packetLossPercent}%, RTT: ${rttMs}ms)`;
      }
    }
    // Pristine conditions: Additive Increase with stability hysteresis
    else if (packetLossPercent <= 1.0 && rttMs <= 60 && jitterMs <= 15 && qualityRating === 'EXCELLENT') {
      this.consecutiveExcellentCount++;
      if (this.consecutiveExcellentCount >= 3) {
        if (this.currentProfile !== 'ULTRA') {
          newProfile = 'ULTRA';
          adjustmentReason = 'Additive Increase: Pristine connection sustained across 3+ intervals';
        }
      } else if (this.currentProfile === 'CRITICAL' || this.currentProfile === 'CONSTRAINED') {
        newProfile = 'STANDARD';
        adjustmentReason = 'Additive Increase: Connection recovered to nominal standard';
      } else if (this.currentProfile === 'STANDARD') {
        newProfile = 'HIGH';
        adjustmentReason = 'Additive Increase: Excellent conditions, stepping up to High profile';
      }
    }
    // Nominal conditions (Loss <= 3.0%, RTT <= 150ms, Jitter <= 30ms)
    else {
      this.consecutiveExcellentCount = 0;
      if (this.currentProfile !== 'STANDARD') {
        newProfile = 'STANDARD';
        adjustmentReason = 'Nominal conditions: Operating at Standard profile';
      }
    }

    if (newProfile !== this.currentProfile) {
      logger.info(`[ADAPTIVE] Transmission profile shifted: ${this.currentProfile} -> ${newProfile} (${adjustmentReason})`);
      this.currentProfile = newProfile;
      this.reason = adjustmentReason;
      this.lastAdjustedTimestamp = now;
    }

    return this.getState();
  }

  /**
   * Manually sets the transmission mode and profile override
   */
  public setMode(mode: 'AUTO' | 'MANUAL', manualProfile?: TransmissionProfile): AdaptiveRateState {
    this.mode = mode;
    if (mode === 'MANUAL' && manualProfile) {
      this.currentProfile = manualProfile;
      this.reason = `Manual override set to ${manualProfile}`;
      this.lastAdjustedTimestamp = Date.now();
      logger.info(`[ADAPTIVE] Manual profile locked to ${manualProfile}`);
    } else if (mode === 'AUTO') {
      this.reason = 'Mode set to AUTO AIMD rate control';
      this.consecutiveExcellentCount = 0;
      logger.info('[ADAPTIVE] Switched to AUTO rate control');
    }
    return this.getState();
  }

  /**
   * Sets FEC active state explicitly (e.g. forced by room configuration)
   */
  public setFecActive(active: boolean): void {
    this.fecActive = active;
  }

  /**
   * Records a successful packet recovery via redundant FEC frame
   */
  public recordFecRecovery(): number {
    this.fecRecoveredCount++;
    return this.fecRecoveredCount;
  }

  /**
   * Returns a snapshot of the current adaptive state
   */
  public getState(): AdaptiveRateState {
    const spec = TRANSMISSION_PROFILES[this.currentProfile];
    return {
      mode: this.mode,
      profile: this.currentProfile,
      targetBitrateKbps: spec.targetBitrateKbps,
      frameIntervalMs: spec.frameIntervalMs,
      fecActive: this.fecActive,
      fecRecoveredCount: this.fecRecoveredCount,
      targetPlayoutDelayMs: this.targetPlayoutDelayMs,
      reason: this.reason,
      lastAdjustedTimestamp: this.lastAdjustedTimestamp,
    };
  }

  /**
   * Resets adaptive counters
   */
  public reset(): void {
    this.mode = 'AUTO';
    this.currentProfile = 'STANDARD';
    this.fecActive = false;
    this.fecRecoveredCount = 0;
    this.targetPlayoutDelayMs = 35;
    this.consecutiveExcellentCount = 0;
    this.reason = 'Reset to default Standard profile';
    this.lastAdjustedTimestamp = Date.now();
  }
}
