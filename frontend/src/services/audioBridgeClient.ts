/**
 * Client service to communicate with Local Audio Companion Bridge (ws://127.0.0.1:5002)
 */

export interface BridgeStatusMessage {
  type: 'SESSION_STATUS';
  status: 'REGISTERED' | 'CONNECTING' | 'ERROR' | 'CLOSED';
  sessionId?: string;
  roomCode?: string;
  error?: string;
}

export interface NetworkMetrics {
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
  qualityRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  timestamp: number;
}

export interface AdaptiveState {
  mode: 'AUTO' | 'MANUAL';
  profile: 'ULTRA' | 'HIGH' | 'STANDARD' | 'CONSTRAINED' | 'CRITICAL';
  targetBitrateKbps: number;
  frameIntervalMs: number;
  fecActive: boolean;
  fecRecoveredCount: number;
  targetPlayoutDelayMs: number;
  reason: string;
  lastAdjustedTimestamp: number;
}

export interface BridgeAdaptiveMessage {
  type: 'ADAPTIVE_STATE_UPDATE';
  adaptiveState: AdaptiveState;
}

export interface BridgeNetworkMetricsMessage {
  type: 'NETWORK_METRICS';
  metrics: NetworkMetrics;
}

export interface BridgeAudioFrameMessage {
  type: 'AUDIO_FRAME';
  senderSessionId: string;
  senderClientId: string;
  sequence: number;
  timestamp: number;
  pcm: string; // Base64
}

export type BridgeMessageListener = (msg: any) => void;

export class AudioBridgeClient {
  private ws: WebSocket | null = null;
  private bridgeUrl: string = 'ws://127.0.0.1:5002';
  private messageListeners: Set<BridgeMessageListener> = new Set();
  public isConnected: boolean = false;
  public sessionId: string | null = null;
  public latestMetrics: NetworkMetrics | null = null;
  public latestAdaptiveState: AdaptiveState | null = null;

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve();
          return;
        }

        this.ws = new WebSocket(this.bridgeUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'SESSION_STATUS' && data.status === 'REGISTERED') {
              this.sessionId = data.sessionId || null;
            }
            if (data.type === 'NETWORK_METRICS' && data.metrics) {
              this.latestMetrics = data.metrics;
            }
            if (data.type === 'ADAPTIVE_STATE_UPDATE' && data.adaptiveState) {
              this.latestAdaptiveState = data.adaptiveState;
            }
            this.messageListeners.forEach((fn) => fn(data));
          } catch (err) {
            console.error('[AudioBridgeClient] Error parsing message:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[AudioBridgeClient] WebSocket error:', err);
          this.isConnected = false;
          reject(new Error('Failed to connect to local audio bridge at ws://127.0.0.1:5002'));
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.sessionId = null;
          this.latestAdaptiveState = null;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public startSession(token: string, roomCode: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected to local companion bridge');
    }
    this.ws.send(JSON.stringify({ type: 'START_SESSION', token, roomCode }));
  }

  public sendAudioFrame(pcmBase64: string, sequence: number, frameDurationMs?: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'AUDIO_FRAME',
          pcm: pcmBase64,
          sequence,
          ...(frameDurationMs ? { frameDurationMs } : {}),
        })
      );
    }
  }

  public setMute(muted: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SET_MUTE', muted }));
    }
  }

  public setTransmissionMode(mode: 'AUTO' | 'MANUAL', profile?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SET_TRANSMISSION_MODE', mode, profile }));
    }
  }

  public requestAdaptiveState(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'GET_ADAPTIVE_STATE' }));
    }
  }

  public stopSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'STOP_SESSION' }));
    }
    this.disconnect();
  }

  public addMessageListener(listener: BridgeMessageListener): void {
    this.messageListeners.add(listener);
  }

  public removeMessageListener(listener: BridgeMessageListener): void {
    this.messageListeners.delete(listener);
  }

  public requestMetrics(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'GET_METRICS' }));
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.sessionId = null;
    this.latestMetrics = null;
    this.latestAdaptiveState = null;
    this.messageListeners.clear();
  }
}

export const audioBridgeClient = new AudioBridgeClient();
