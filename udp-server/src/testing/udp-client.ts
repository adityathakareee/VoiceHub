import dgram, { Socket } from 'dgram';
import { UdpPacket, UdpPacketType } from '../networking/packet.types';
import { logger } from '../utils/logger';

export interface UdpClientOptions {
  host: string;
  port: number;
  clientId?: string;
}

export class UdpTestClient {
  private socket: Socket;
  private host: string;
  private port: number;
  public clientId: string;
  public sessionId: string | null = null;
  public roomCode: string | null = null;
  public receivedPackets: UdpPacket[] = [];
  public lastPongRttMs: number | null = null;

  private pingSentTimestamp: number | null = null;

  constructor(opts: UdpClientOptions) {
    this.host = opts.host;
    this.port = opts.port;
    this.clientId = opts.clientId || `test_client_${Math.random().toString(36).substring(2, 8)}`;
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg: Buffer) => {
      this.handleMessage(msg);
    });
  }

  private handleMessage(msg: Buffer): void {
    const rawStr = msg.toString('utf-8').trim();

    // Legacy "PONG" string
    if (rawStr === 'PONG') {
      if (this.pingSentTimestamp) {
        this.lastPongRttMs = Math.round(performance.now() - this.pingSentTimestamp);
      }
      this.receivedPackets.push({
        version: 1,
        type: UdpPacketType.PONG,
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const packet: UdpPacket = JSON.parse(rawStr);
      this.receivedPackets.push(packet);

      if (packet.type === UdpPacketType.REGISTER_ACK && packet.sessionId) {
        this.sessionId = packet.sessionId;
        this.roomCode = packet.roomCode || null;
      }

      if (packet.type === UdpPacketType.PONG && this.pingSentTimestamp) {
        this.lastPongRttMs = Math.round(performance.now() - this.pingSentTimestamp);
      }
    } catch (_err) {
      logger.warn(`[TEST CLIENT ${this.clientId}] Received raw non-JSON packet: "${rawStr}"`);
    }
  }

  public register(token: string, roomCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const packet: UdpPacket = {
        version: 1,
        type: UdpPacketType.REGISTER,
        clientId: this.clientId,
        token,
        roomCode,
        timestamp: Date.now(),
      };

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for REGISTER_ACK from server`));
      }, 3000);

      const checkAck = setInterval(() => {
        if (this.sessionId) {
          clearTimeout(timeout);
          clearInterval(checkAck);
          resolve(this.sessionId);
        }
      }, 50);

      this.sendPacket(packet);
    });
  }

  public sendPing(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.pingSentTimestamp = performance.now();
      this.lastPongRttMs = null;

      const packet: UdpPacket = {
        version: 1,
        type: UdpPacketType.PING,
        sessionId: this.sessionId || undefined,
        timestamp: Date.now(),
      };

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for PONG response'));
      }, 3000);

      const checkPong = setInterval(() => {
        if (this.lastPongRttMs !== null) {
          clearTimeout(timeout);
          clearInterval(checkPong);
          resolve(this.lastPongRttMs);
        }
      }, 20);

      this.sendPacket(packet);
    });
  }

  public sendHeartbeat(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.sessionId) {
        reject(new Error('Client not registered'));
        return;
      }

      const initialCount = this.receivedPackets.length;
      const packet: UdpPacket = {
        version: 1,
        type: UdpPacketType.HEARTBEAT,
        sessionId: this.sessionId,
        timestamp: Date.now(),
      };

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for HEARTBEAT_ACK'));
      }, 3000);

      const checkAck = setInterval(() => {
        const newPackets = this.receivedPackets.slice(initialCount);
        const ack = newPackets.find((p) => p.type === UdpPacketType.HEARTBEAT_ACK);
        if (ack) {
          clearTimeout(timeout);
          clearInterval(checkAck);
          resolve(true);
        }
      }, 20);

      this.sendPacket(packet);
    });
  }

  public sendData(sequence: number, payload: any): void {
    if (!this.sessionId) {
      throw new Error('Client must be registered before sending DATA');
    }

    const packet: UdpPacket = {
      version: 1,
      type: UdpPacketType.DATA,
      sessionId: this.sessionId,
      sequence,
      timestamp: Date.now(),
      payload,
    };

    this.sendPacket(packet);
  }

  public sendRawString(rawStr: string): void {
    const buffer = Buffer.from(rawStr, 'utf-8');
    this.socket.send(buffer, 0, buffer.length, this.port, this.host);
  }

  public sendRawBuffer(buffer: Buffer): void {
    this.socket.send(buffer, 0, buffer.length, this.port, this.host);
  }

  public sendPacket(packet: UdpPacket): void {
    const jsonStr = JSON.stringify(packet);
    const buffer = Buffer.from(jsonStr, 'utf-8');
    this.socket.send(buffer, 0, buffer.length, this.port, this.host);
  }

  public leave(): void {
    if (this.sessionId) {
      const packet: UdpPacket = {
        version: 1,
        type: UdpPacketType.LEAVE,
        sessionId: this.sessionId,
        timestamp: Date.now(),
      };
      this.sendPacket(packet);
      this.sessionId = null;
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.leave();
      this.socket.close(() => {
        resolve();
      });
    });
  }
}
