import { envConfig } from '../config/env.config';

export interface PresenceParticipant {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: string;
}

export type PresenceEventType =
  | 'ROOM_SYNC'
  | 'PARTICIPANT_JOINED'
  | 'PARTICIPANT_LEFT'
  | 'PARTICIPANT_MUTED'
  | 'PARTICIPANT_SPEAKING'
  | 'ROOM_UPDATED'
  | 'ROOM_CLOSED'
  | 'CONNECTION_STATE';

export interface PresenceEventMessage {
  type: PresenceEventType;
  roomCode?: string;
  participants?: PresenceParticipant[];
  participant?: PresenceParticipant;
  userId?: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  room?: {
    name: string;
    description?: string;
    maxParticipants: number;
  };
  state?: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  timestamp?: number;
}

export type PresenceEventListener = (event: PresenceEventMessage) => void;

export class RoomPresenceClient {
  private ws: WebSocket | null = null;
  private currentRoomCode: string | null = null;
  private listeners: Set<PresenceEventListener> = new Set();
  private reconnectTimer: any = null;
  private isExplicitDisconnect: boolean = false;
  private pingInterval: any = null;
  private reconnectAttempts: number = 0;
  private initialReconnectDelayMs: number = 1000;
  private maxReconnectDelayMs: number = 10000;

  public isConnected: boolean = false;

  public connect(roomCode: string, token?: string): void {
    if (this.currentRoomCode === roomCode && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.disconnect();
    this.currentRoomCode = roomCode;
    this.isExplicitDisconnect = false;

    this.notifyListeners({
      type: 'CONNECTION_STATE',
      state: 'CONNECTING',
    });

    try {
      const baseUrl = envConfig.apiBaseUrl.replace(/^http/, 'ws');
      let url = `${baseUrl}/ws/control?roomCode=${encodeURIComponent(roomCode)}`;
      if (token) {
        url += `&token=${encodeURIComponent(token)}`;
      }

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyListeners({
          type: 'CONNECTION_STATE',
          state: 'CONNECTED',
        });

        // Start ping heartbeat every 15 seconds
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data: PresenceEventMessage = JSON.parse(event.data);
          this.notifyListeners(data);
        } catch (err) {
          console.error('[RoomPresenceClient] Failed to parse message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[RoomPresenceClient] WebSocket error:', err);
        this.notifyListeners({
          type: 'CONNECTION_STATE',
          state: 'ERROR',
        });
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        this.notifyListeners({
          type: 'CONNECTION_STATE',
          state: 'DISCONNECTED',
        });

        // Bounded exponential backoff auto-reconnect
        if (!this.isExplicitDisconnect && this.currentRoomCode) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          const backoffDelay = Math.min(
            this.initialReconnectDelayMs * Math.pow(1.5, this.reconnectAttempts),
            this.maxReconnectDelayMs
          );
          this.reconnectAttempts++;

          this.reconnectTimer = setTimeout(() => {
            if (!this.isExplicitDisconnect && this.currentRoomCode) {
              this.connect(this.currentRoomCode, token);
            }
          }, backoffDelay);
        }
      };
    } catch (err) {
      console.error('[RoomPresenceClient] Connection error:', err);
      this.notifyListeners({
        type: 'CONNECTION_STATE',
        state: 'ERROR',
      });
    }
  }

  public setMute(isMuted: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SET_MUTE', isMuted }));
    }
  }

  public setSpeaking(isSpeaking: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SET_SPEAKING', isSpeaking }));
    }
  }

  public addListener(listener: PresenceEventListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: PresenceEventListener): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(event: PresenceEventMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[RoomPresenceClient] Listener error:', err);
      }
    });
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_e) {
        // ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.currentRoomCode = null;
  }
}

export const roomPresenceClient = new RoomPresenceClient();
