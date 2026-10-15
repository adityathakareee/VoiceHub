import http from 'http';
import dgram from 'dgram';
import { WebSocketServer, WebSocket } from 'ws';
import { envConfig } from '../config/env.config';
import { UdpPacket, UdpPacketType, NetworkTelemetry } from '../networking/packet.types';
import { PacketParser } from '../networking/packet.parser';
import { UdpMetricsCollector } from '../networking/metrics.collector';
import { AdaptiveRateController } from '../networking/adaptive.controller';
import { logger } from '../utils/logger';

const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '5002', 10);
const UDP_SERVER_HOST = process.env.UDP_HOST || '127.0.0.1';
const UDP_SERVER_PORT = parseInt(process.env.UDP_PORT || '5001', 10);

/**
 * Compands 16-bit little-endian PCM samples to 8-bit signed representation.
 * Reduces raw buffer size by 50% while preserving voice intelligibility.
 */
export function compandPcm16BufferTo8(pcm16Buf: Buffer, decimateFactor: number = 1): Buffer {
  const totalSamples = Math.floor(pcm16Buf.length / 2);
  const factor = Math.max(1, decimateFactor);
  const outSamples = Math.ceil(totalSamples / factor);
  const out = Buffer.alloc(outSamples);
  for (let i = 0; i < outSamples; i++) {
    const sampleIdx = Math.min(i * factor, totalSamples - 1);
    const s16 = pcm16Buf.readInt16LE(sampleIdx * 2);
    const s8 = Math.max(-128, Math.min(127, Math.round(s16 / 256)));
    out.writeInt8(s8, i);
  }
  return out;
}

/**
 * Expands 8-bit signed samples back to 16-bit little-endian PCM.
 */
export function expandPcm8BufferTo16(pcm8Buf: Buffer, decimateFactor: number = 1): Buffer {
  const factor = Math.max(1, decimateFactor);
  const out = Buffer.alloc(pcm8Buf.length * factor * 2);
  for (let i = 0; i < pcm8Buf.length; i++) {
    const s8 = pcm8Buf.readInt8(i);
    const s16 = Math.max(-32768, Math.min(32767, s8 * 256));
    for (let f = 0; f < factor; f++) {
      out.writeInt16LE(s16, (i * factor + f) * 2);
    }
  }
  return out;
}

/**
 * Encodes a previous PCM frame into an MTU-safe compact redundant payload.
 * Downsamples/decimates by factor and compands to 8-bit to stay strictly within 1200 bytes UDP MTU.
 */
export function encodeMtuSafeRedundancy(
  pcm16Buf: Buffer,
  downsampleFactor: number = 4
): { redundantBase64: string; factor: number } {
  const totalSamples = Math.floor(pcm16Buf.length / 2);
  const factor = Math.max(1, downsampleFactor);
  const reducedSamples = Math.ceil(totalSamples / factor);
  const companded = Buffer.alloc(reducedSamples);

  for (let i = 0; i < reducedSamples; i++) {
    const sampleIdx = Math.min(i * factor, totalSamples - 1);
    const s16 = pcm16Buf.readInt16LE(sampleIdx * 2);
    const s8 = Math.max(-128, Math.min(127, Math.round(s16 / 256)));
    companded.writeInt8(s8, i);
  }

  return {
    redundantBase64: companded.toString('base64'),
    factor,
  };
}

/**
 * Decodes an MTU-safe compact redundant payload back to full 16kHz PCM16 base64.
 */
export function decodeMtuSafeRedundancy(
  redundantBase64: string,
  factor: number = 4,
  expectedSamples: number = 320
): string {
  const compandedBuf = Buffer.from(redundantBase64, 'base64');
  // Check if buffer is already raw PCM16
  if (factor <= 1 && compandedBuf.length >= expectedSamples * 2) {
    return redundantBase64;
  }

  const decFactor = factor > 0 ? factor : 4;
  const targetSampleCount = compandedBuf.length * decFactor;
  const outBuf = Buffer.alloc(targetSampleCount * 2);

  for (let i = 0; i < compandedBuf.length; i++) {
    const s8 = compandedBuf.readInt8(i);
    const s16 = Math.max(-32768, Math.min(32767, s8 * 256));
    for (let f = 0; f < decFactor; f++) {
      const outIdx = i * decFactor + f;
      if (outIdx < targetSampleCount) {
        outBuf.writeInt16LE(s16, outIdx * 2);
      }
    }
  }

  return outBuf.toString('base64');
}

export class LocalAudioBridge {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ service: 'CSE Voice Hub Local Audio Bridge', status: 'running' }));
        });

        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
          const origin = req.headers.origin || '';
          logger.info(`[BRIDGE] Browser connection attempt from origin: ${origin}`);

          // Origin security check
          if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
            logger.warn(`[BRIDGE] Connection rejected: Unauthorized origin '${origin}'`);
            ws.close(4001, 'Unauthorized Origin');
            return;
          }

          this.handleClientConnection(ws);
        });

        if (this.server) {
          this.server.on('error', (err) => {
            reject(err);
          });

          this.server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
            logger.info(`[BRIDGE] Local Audio Companion Bridge listening on ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);
            resolve();
          });
        }
      } catch (err) {
        logger.error('[BRIDGE] Failed to start local audio bridge:', err);
        reject(err);
      }
    });
  }

  private handleClientConnection(ws: WebSocket): void {
    let udpSocket: dgram.Socket | null = null;
    let sessionId: string | null = null;
    let roomCode: string | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let metricsTimer: NodeJS.Timeout | null = null;
    let isMuted = false;
    let sequenceCounter = 0;

    // Phase 7 Network Telemetry & Metrics state
    let smoothedRtt = 0;
    let packetsSent = 0;
    let packetsReceived = 0;
    let packetsLostTotal = 0;
    let bytesSent = 0;
    let bytesReceived = 0;
    let windowBytesSent = 0;
    let windowBytesReceived = 0;
    let windowStartTime = Date.now();
    let bitrateUpKbps = 0;
    let bitrateDownKbps = 0;

    // Phase 8 Adaptive Rate & Transmission Control state
    const adaptiveController = new AdaptiveRateController();
    let lastTransmittedPcm: string | null = null;
    let lastTransmittedSeq: number | null = null;

    const remoteStreamStats = new Map<
      string,
      {
        lastSequence: number;
        lastArrival: number;
        lastTimestamp: number;
        jitter: number;
      }
    >();

    const getTelemetrySnapshot = (): NetworkTelemetry => {
      const totalExpected = packetsReceived + packetsLostTotal;
      const lossPercent = totalExpected > 0 ? (packetsLostTotal / totalExpected) * 100 : 0.0;
      let maxJitter = 0;
      remoteStreamStats.forEach((s) => {
        if (s.jitter > maxJitter) maxJitter = s.jitter;
      });

      const qualityRating = UdpMetricsCollector.calculateQualityRating(smoothedRtt, maxJitter, lossPercent);

      return {
        rttMs: Math.round(smoothedRtt),
        jitterMs: Number(maxJitter.toFixed(2)),
        packetLossPercent: Number(lossPercent.toFixed(2)),
        packetsSent,
        packetsReceived,
        packetsLost: packetsLostTotal,
        bytesSent,
        bytesReceived,
        bitrateUpKbps: Number(bitrateUpKbps.toFixed(1)),
        bitrateDownKbps: Number(bitrateDownKbps.toFixed(1)),
        qualityRating,
        timestamp: Date.now(),
      };
    };

    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (metricsTimer) {
        clearInterval(metricsTimer);
        metricsTimer = null;
      }

      if (udpSocket && sessionId) {
        try {
          const leavePacket: UdpPacket = {
            version: 1,
            type: UdpPacketType.LEAVE,
            sessionId,
            timestamp: Date.now(),
          };
          const buf = Buffer.from(JSON.stringify(leavePacket), 'utf-8');
          udpSocket.send(buf, 0, buf.length, UDP_SERVER_PORT, UDP_SERVER_HOST);
        } catch (_e) {
          // ignore cleanup send error
        }
      }

      if (udpSocket) {
        udpSocket.close();
        udpSocket = null;
      }

      sessionId = null;
      roomCode = null;
      isMuted = false;
      remoteStreamStats.clear();
      adaptiveController.reset();
      lastTransmittedPcm = null;
      lastTransmittedSeq = null;
    };

    ws.on('message', (message: Buffer | string) => {
      try {
        const data = JSON.parse(message.toString('utf-8'));

        switch (data.type) {
          case 'START_SESSION': {
            cleanup(); // clean prior session if any

            if (!data.token || !data.roomCode) {
              ws.send(JSON.stringify({ type: 'SESSION_STATUS', status: 'ERROR', error: 'Missing token or roomCode' }));
              return;
            }

            roomCode = data.roomCode;
            udpSocket = dgram.createSocket('udp4');

            udpSocket.on('message', (msg: Buffer) => {
              const parseRes = PacketParser.parse(msg);
              if (!parseRes.success || !parseRes.packet) return;

              const packet = parseRes.packet;

              if (packet.type === UdpPacketType.REGISTER_ACK) {
                sessionId = packet.sessionId || null;
                logger.info(`[BRIDGE] Session registered successfully with ID: ${sessionId}`);

                ws.send(
                  JSON.stringify({
                    type: 'SESSION_STATUS',
                    status: 'REGISTERED',
                    sessionId,
                    roomCode,
                  })
                );

                // Start Heartbeat loop every 5s
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                heartbeatTimer = setInterval(() => {
                  if (udpSocket && sessionId) {
                    const hbPacket: UdpPacket = {
                      version: 1,
                      type: UdpPacketType.HEARTBEAT,
                      sessionId,
                      timestamp: Date.now(),
                    };
                    const buf = Buffer.from(JSON.stringify(hbPacket), 'utf-8');
                    udpSocket.send(buf, 0, buf.length, UDP_SERVER_PORT, UDP_SERVER_HOST);
                  }
                }, 5000);

                // Start Ping/Pong loop for RTT measurement every 2s
                if (pingTimer) clearInterval(pingTimer);
                pingTimer = setInterval(() => {
                  if (udpSocket && sessionId) {
                    const pingPacket: UdpPacket = {
                      version: 1,
                      type: UdpPacketType.PING,
                      sessionId,
                      timestamp: Date.now(),
                    };
                    const buf = Buffer.from(JSON.stringify(pingPacket), 'utf-8');
                    udpSocket.send(buf, 0, buf.length, UDP_SERVER_PORT, UDP_SERVER_HOST);
                  }
                }, 2000);

                // Start periodic telemetry & adaptive broadcast every 1s
                if (metricsTimer) clearInterval(metricsTimer);
                windowStartTime = Date.now();
                metricsTimer = setInterval(() => {
                  const now = Date.now();
                  const elapsedMs = now - windowStartTime;
                  if (elapsedMs >= 1000) {
                    bitrateUpKbps = (windowBytesSent * 8) / elapsedMs;
                    bitrateDownKbps = (windowBytesReceived * 8) / elapsedMs;
                    windowStartTime = now;
                    windowBytesSent = 0;
                    windowBytesReceived = 0;
                  }
                  const telemetry = getTelemetrySnapshot();
                  const adaptiveState = adaptiveController.evaluateNetworkTelemetry(telemetry);
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                      JSON.stringify({
                        type: 'NETWORK_METRICS',
                        metrics: telemetry,
                      })
                    );
                    ws.send(
                      JSON.stringify({
                        type: 'ADAPTIVE_STATE_UPDATE',
                        adaptiveState,
                      })
                    );
                  }
                }, 1000);
              } else if (packet.type === UdpPacketType.PONG) {
                const origTs = (packet.payload as any)?.originalTimestamp || packet.timestamp;
                const measuredRtt = Math.max(0, Date.now() - origTs);
                smoothedRtt = smoothedRtt === 0 ? measuredRtt : 0.8 * smoothedRtt + 0.2 * measuredRtt;
              } else if (packet.type === UdpPacketType.ERROR) {
                logger.error(`[BRIDGE] UDP server returned error: ${packet.error}`);
                ws.send(JSON.stringify({ type: 'SESSION_STATUS', status: 'ERROR', error: packet.error }));
              } else if (packet.type === UdpPacketType.DATA && packet.payload) {
                packetsReceived++;
                bytesReceived += msg.length;
                windowBytesReceived += msg.length;

                // Inbound jitter & sequence gap detection per sender
                const senderKey = packet.sessionId || 'default';
                let sStats = remoteStreamStats.get(senderKey);
                const now = Date.now();
                if (!sStats) {
                  sStats = {
                    lastSequence: packet.sequence || 0,
                    lastArrival: now,
                    lastTimestamp: packet.timestamp || now,
                    jitter: 0,
                  };
                  remoteStreamStats.set(senderKey, sStats);
                } else {
                  if (packet.sequence !== undefined && packet.sequence > sStats.lastSequence + 1 && sStats.lastSequence > 0) {
                    const gap = packet.sequence - sStats.lastSequence - 1;
                    packetsLostTotal += gap;

                    // Phase 8 RFC 2198-inspired Redundancy / FEC Recovery:
                    // If the incoming packet contains a redundant payload for the missing sequence, recover it immediately!
                    const p = packet.payload as any;
                    if (p?.redundantPcm && p?.redundantSeq !== undefined && p.redundantSeq === packet.sequence - 1) {
                      logger.info(`[BRIDGE FEC] Recovered dropped frame seq=${p.redundantSeq} via redundant payload`);
                      adaptiveController.recordFecRecovery();
                      const recoveredPcm = decodeMtuSafeRedundancy(p.redundantPcm, p.redundantFactor || 1);
                      ws.send(
                        JSON.stringify({
                          type: 'AUDIO_FRAME',
                          senderSessionId: packet.sessionId,
                          senderClientId: packet.clientId,
                          sequence: p.redundantSeq,
                          timestamp: packet.timestamp - (p.frameDurationMs || 20),
                          pcm: recoveredPcm,
                          isFecRecovered: true,
                        })
                      );
                    }
                  }
                  if (packet.sequence !== undefined && packet.sequence > sStats.lastSequence) {
                    sStats.lastSequence = packet.sequence;
                  }
                  if (sStats.lastArrival > 0 && sStats.lastTimestamp > 0) {
                    const D = Math.abs((now - packet.timestamp) - (sStats.lastArrival - sStats.lastTimestamp));
                    sStats.jitter = sStats.jitter + (D - sStats.jitter) / 16;
                  }
                  sStats.lastArrival = now;
                  sStats.lastTimestamp = packet.timestamp;
                }

                // Forward incoming DATA audio frame to browser WebSocket
                const p = packet.payload as any;
                let forwardPcm = p.pcm;
                if (p.format === 'pcm8') {
                  const pcm8Buf = Buffer.from(p.pcm, 'base64');
                  const pcm16Buf = expandPcm8BufferTo16(pcm8Buf, p.decimateFactor || 1);
                  forwardPcm = pcm16Buf.toString('base64');
                }
                ws.send(
                  JSON.stringify({
                    type: 'AUDIO_FRAME',
                    senderSessionId: packet.sessionId,
                    senderClientId: packet.clientId,
                    sequence: packet.sequence,
                    timestamp: packet.timestamp,
                    pcm: forwardPcm,
                  })
                );
              }
            });

            // Dispatch REGISTER packet to UDP server
            const regPacket: UdpPacket = {
              version: 1,
              type: UdpPacketType.REGISTER,
              token: data.token,
              roomCode: data.roomCode,
              clientId: `bridge_${Math.random().toString(36).substring(2, 8)}`,
              timestamp: Date.now(),
            };

            const regBuf = Buffer.from(JSON.stringify(regPacket), 'utf-8');
            udpSocket.send(regBuf, 0, regBuf.length, UDP_SERVER_PORT, UDP_SERVER_HOST, (err) => {
              if (err) {
                logger.error('[BRIDGE] Failed to dispatch REGISTER to UDP server:', err);
                ws.send(JSON.stringify({ type: 'SESSION_STATUS', status: 'ERROR', error: err.message }));
              }
            });
            break;
          }

          case 'SET_MUTE': {
            isMuted = !!data.muted;
            logger.info(`[BRIDGE] Mute state updated: ${isMuted}`);
            ws.send(JSON.stringify({ type: 'MUTE_STATUS', muted: isMuted }));
            break;
          }

          case 'AUDIO_FRAME': {
            if (isMuted) {
              // Muted: strictly do NOT forward audio frame over UDP
              return;
            }

            if (!udpSocket || !sessionId) {
              return;
            }

            sequenceCounter++;
            const seq = data.sequence !== undefined ? data.sequence : sequenceCounter;
            const adaptiveState = adaptiveController.getState();
            const frameDurationMs = data.frameDurationMs || adaptiveState.frameIntervalMs || 20;

            const rawPcmBuf = Buffer.from(data.pcm, 'base64');
            const sampleCount = Math.floor(rawPcmBuf.length / 2);

            // Determine if primary payload needs companding to 8-bit to respect 1200 MTU
            // (e.g. 400 samples = 800 bytes, 640 samples = 1280 bytes)
            let primaryFormat = 'pcm16';
            let primaryPcm = data.pcm;
            let primaryDecimate = 1;

            if (sampleCount > 320 || (adaptiveState.fecActive && sampleCount > 240)) {
              primaryDecimate = (adaptiveState.fecActive && sampleCount > 400) ? 2 : 1;
              const companded8 = compandPcm16BufferTo8(rawPcmBuf, primaryDecimate);
              primaryPcm = companded8.toString('base64');
              primaryFormat = 'pcm8';
            }

            const audioPayload: any = {
              mediaType: primaryFormat === 'pcm8' ? 'audio/pcm8' : 'audio/pcm16',
              format: primaryFormat,
              ...(primaryDecimate > 1 ? { decimateFactor: primaryDecimate } : {}),
              sampleRate: 16000,
              channels: 1,
              frameDurationMs,
              pcm: primaryPcm,
            };

            // Phase 8 RFC 2198-inspired Redundancy: attach prior frame if FEC is active
            if (adaptiveState.fecActive && lastTransmittedPcm && lastTransmittedSeq !== null) {
              const priorBuf = Buffer.from(lastTransmittedPcm, 'base64');
              const priorSamples = Math.floor(priorBuf.length / 2);
              // Factor: 4 for <= 240 samples, 5 for 320-400 samples, 8 for > 400 samples
              const factor = priorSamples <= 240 ? 4 : priorSamples <= 400 ? 5 : 8;
              const { redundantBase64, factor: usedFactor } = encodeMtuSafeRedundancy(priorBuf, factor);
              audioPayload.redundantSeq = lastTransmittedSeq;
              audioPayload.redundantPcm = redundantBase64;
              audioPayload.redundantFactor = usedFactor;
            }

            lastTransmittedPcm = data.pcm;
            lastTransmittedSeq = seq;

            const dataPacket: UdpPacket = {
              version: 1,
              type: UdpPacketType.DATA,
              sessionId,
              sequence: seq,
              timestamp: Date.now(),
              payload: audioPayload,
            };

            let dataBuf = Buffer.from(JSON.stringify(dataPacket), 'utf-8');

            // Fallback safety check: if packet still exceeds UDP MTU, compand primary payload to guarantee safe transit
            if (dataBuf.length > envConfig.UDP_MAX_PACKET_SIZE && audioPayload.format !== 'pcm8') {
              const compandedFallback = compandPcm16BufferTo8(rawPcmBuf);
              audioPayload.pcm = compandedFallback.toString('base64');
              audioPayload.format = 'pcm8';
              audioPayload.mediaType = 'audio/pcm8';
              dataPacket.payload = audioPayload;
              dataBuf = Buffer.from(JSON.stringify(dataPacket), 'utf-8');
            }

            if (dataBuf.length > envConfig.UDP_MAX_PACKET_SIZE) {
              logger.warn(`[BRIDGE] Audio frame packet dropped: size ${dataBuf.length} exceeds max limit ${envConfig.UDP_MAX_PACKET_SIZE}`);
              return;
            }

            packetsSent++;
            bytesSent += dataBuf.length;
            windowBytesSent += dataBuf.length;

            udpSocket.send(dataBuf, 0, dataBuf.length, UDP_SERVER_PORT, UDP_SERVER_HOST);
            break;
          }

          case 'GET_METRICS': {
            ws.send(JSON.stringify({ type: 'NETWORK_METRICS', metrics: getTelemetrySnapshot() }));
            break;
          }

          case 'SET_TRANSMISSION_MODE': {
            const updatedState = adaptiveController.setMode(data.mode, data.profile);
            ws.send(JSON.stringify({ type: 'ADAPTIVE_STATE_UPDATE', adaptiveState: updatedState }));
            break;
          }

          case 'GET_ADAPTIVE_STATE': {
            ws.send(JSON.stringify({ type: 'ADAPTIVE_STATE_UPDATE', adaptiveState: adaptiveController.getState() }));
            break;
          }

          case 'STOP_SESSION': {
            cleanup();
            ws.send(JSON.stringify({ type: 'SESSION_STATUS', status: 'CLOSED' }));
            break;
          }

          default:
            break;
        }
      } catch (err: any) {
        logger.error('[BRIDGE] Message parsing/processing error:', err);
      }
    });

    ws.on('close', () => {
      logger.info('[BRIDGE] Client WebSocket closed. Cleaning up resources.');
      cleanup();
    });

    ws.on('error', (err) => {
      logger.error('[BRIDGE] Client WebSocket error:', err);
      cleanup();
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
      }
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// Standalone runner execution entry point
if (require.main === module) {
  const bridge = new LocalAudioBridge();
  bridge.start().then(() => {
    const handleShutdown = async (sig: string) => {
      logger.info(`[BRIDGE] Received ${sig}. Shutting down Local Companion Bridge gracefully...`);
      await bridge.stop();
      logger.info('[BRIDGE] Bridge shutdown completed cleanly. Exiting.');
      process.exit(0);
    };
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  }).catch((err) => {
    logger.error('Failed to run Local Audio Bridge:', err);
    process.exit(1);
  });
}
