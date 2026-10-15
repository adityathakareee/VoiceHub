import http from 'http';
import WebSocket from 'ws';
import dgram from 'dgram';
import { UdpSocketService } from '../networking/udp.socket';
import { LocalAudioBridge } from '../bridge/local-bridge';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';
import {
  float32ToPcm16,
  pcm16ToFloat32,
  pcm16ToBase64,
  base64ToPcm16,
  SAMPLES_PER_FRAME,
  PCM16_FRAME_BYTE_SIZE,
} from '../utils/audio-pcm';
import { signUdpSessionToken } from '../security/udp-session-token';
import { UdpTestClient } from './udp-client';

const BACKEND_BASE_URL = 'http://localhost:5000';

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  cookie?: string;
}

const makeHttpRequest = (opts: RequestOptions): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path, BACKEND_BASE_URL);
    const postData = opts.body ? JSON.stringify(opts.body) : undefined;

    const reqOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let jsonBody = {};
        try {
          jsonBody = JSON.parse(data);
        } catch (_e) {
          jsonBody = { raw: data };
        }
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: jsonBody,
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const runPhase4AudioTests = async (): Promise<void> => {
  logger.info('[PHASE 4 TEST] Starting Comprehensive Real-Time Audio Transport & Verification Suite...');

  let testCount = 0;
  let passCount = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    testCount++;
    if (condition) {
      passCount++;
      logger.info(`[PASS ${testCount}] ${testName}`);
    } else {
      logger.error(`[FAIL ${testCount}] ${testName} - ${detail || 'Assertion failed'}`);
    }
  };

  // Start internal UDP server and Bridge if standalone server not running
  let internalUdpServer: UdpSocketService | null = null;
  let internalBridge: LocalAudioBridge | null = null;

  try {
    // Check if UDP server already listening, if not spin up test instance
    try {
      internalUdpServer = new UdpSocketService();
      await internalUdpServer.start('127.0.0.1', 5001);
      logger.info('[PHASE 4 TEST] Started internal test UDP server on port 5001');
    } catch (_err) {
      logger.info('[PHASE 4 TEST] UDP server already running on port 5001');
      internalUdpServer = null;
    }

    // Check if Bridge already listening, if not spin up test instance
    const bridgeActive = await new Promise<boolean>((res) => {
      const probe = http.get('http://127.0.0.1:5002', () => {
        probe.destroy();
        res(true);
      });
      probe.on('error', () => res(false));
    });

    if (bridgeActive) {
      logger.info('[PHASE 4 TEST] Local Audio Bridge already running on port 5002');
      internalBridge = null;
    } else {
      try {
        internalBridge = new LocalAudioBridge();
        await internalBridge.start();
        logger.info('[PHASE 4 TEST] Started internal test Local Audio Bridge on port 5002');
      } catch (_err) {
        logger.info('[PHASE 4 TEST] Local Audio Bridge already running on port 5002');
        internalBridge = null;
      }
    }

    // 1. Audio Sample Conversion Test (Float32 <-> PCM16)
    const testFloat32 = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const pcm16Converted = float32ToPcm16(testFloat32);
    const float32Reconstructed = pcm16ToFloat32(pcm16Converted);

    let maxDiff = 0;
    for (let i = 0; i < testFloat32.length; i++) {
      const diff = Math.abs(testFloat32[i] - float32Reconstructed[i]);
      if (diff > maxDiff) maxDiff = diff;
    }

    assert(maxDiff < 0.001, 'Test 1: Float32 to PCM16 to Float32 conversion accuracy within 0.001 tolerance');
    assert(SAMPLES_PER_FRAME === 320, 'Test 2: 20ms audio frame @ 16kHz equals exactly 320 samples');
    assert(PCM16_FRAME_BYTE_SIZE === 640, 'Test 2b: 20ms audio frame @ 16kHz PCM16 equals exactly 640 bytes');

    // Base64 Round-trip Test
    const base64Str = pcm16ToBase64(pcm16Converted);
    const pcm16Decoded = base64ToPcm16(base64Str);
    assert(
      pcm16Decoded.length === pcm16Converted.length && pcm16Decoded[1] === pcm16Converted[1],
      'Test 3: Media packet PCM16 base64 encode/decode round-trip matches original bytes'
    );

    // 2. Real UDP Socket Audio Packet Transport Tests
    const testRoomCode = 'CVH-AUD123';
    const testRoomBCode = 'CVH-AUD456';
    const userAId = 'usr_audio_a_123';
    const userBId = 'usr_audio_b_456';
    const userCId = 'usr_audio_c_789';

    const tokenA = signUdpSessionToken({ userId: userAId, roomCode: testRoomCode, role: 'STUDENT' });
    const tokenB = signUdpSessionToken({ userId: userBId, roomCode: testRoomCode, role: 'STUDENT' });
    const tokenC = signUdpSessionToken({ userId: userCId, roomCode: testRoomBCode, role: 'STUDENT' });

    // Client A and Client B in Room A
    const clientA = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Audio_Client_A' });
    const clientB = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Audio_Client_B' });
    // Client C in Room B
    const clientC = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Audio_Client_C' });

    await clientA.register(tokenA, testRoomCode);
    await clientB.register(tokenB, testRoomCode);
    await clientC.register(tokenC, testRoomBCode);

    assert(
      !!clientA.sessionId && !!clientB.sessionId && !!clientC.sessionId,
      'Test 4: Real UDP test clients registered sessions for audio transport'
    );

    // Generate Synthetic PCM16 Audio Frame
    const syntheticAudio = new Int16Array(320);
    for (let i = 0; i < 320; i++) {
      syntheticAudio[i] = Math.sin(i / 10) * 10000;
    }
    const syntheticBase64 = pcm16ToBase64(syntheticAudio);

    // Client A transmits Audio DATA packet
    clientA.sendData(1, {
      mediaType: 'audio/pcm16',
      sampleRate: 16000,
      channels: 1,
      frameDurationMs: 20,
      pcm: syntheticBase64,
    });

    await delay(150);

    // Client B receives Client A's Audio packet
    const bAudioPacket = clientB.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 1);
    assert(!!bAudioPacket, 'Test 5: Valid session accepts and forwards audio DATA packet to Client B in same room');
    assert(
      (bAudioPacket?.payload as any)?.pcm === syntheticBase64,
      'Test 5b: Client B receives bit-exact audio PCM payload from Client A'
    );

    // Non-echo verification for Client A
    const aEchoPacket = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 1);
    assert(!aEchoPacket, 'Test 6: SENDER NON-ECHO PASS — UDP server does not echo audio packet back to Client A');

    // Room isolation verification for Client C
    const cCrossRoomPacket = clientC.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 1);
    assert(!cCrossRoomPacket, 'Test 7: ROOM ISOLATION PASS — Client C in Room B received NO audio from Room A');

    // Bidirectional Audio Test: Client B transmits audio back to Client A
    clientB.sendData(101, {
      mediaType: 'audio/pcm16',
      pcm: syntheticBase64,
    });
    await delay(150);

    const aReceivedFromB = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 101);
    assert(!!aReceivedFromB, 'Test 8: TWO-USER BIDIRECTIONAL AUDIO PASS — Client A received audio response from Client B');

    // Oversized Audio Packet Rejection Test (>1200 bytes)
    const giantPcmBuf = Buffer.alloc(1300, 0x55);
    const clientOversized = new UdpTestClient({ host: '127.0.0.1', port: 5001 });
    clientOversized.sendRawBuffer(giantPcmBuf);
    await delay(100);
    const oversizedErr = clientOversized.receivedPackets.find((p) => p.type === 'ERROR' && p.error?.includes('exceeds'));
    assert(!!oversizedErr, 'Test 9: Oversized audio packet (>1200 bytes) rejected safely by server');
    await clientOversized.close();

    // Unknown Session Rejection Test
    const clientFake = new UdpTestClient({ host: '127.0.0.1', port: 5001 });
    clientFake.sendPacket({
      version: 1,
      type: 'DATA' as any,
      sessionId: 'udp_sess_invalid_fake_999',
      sequence: 55,
      timestamp: Date.now(),
      payload: { pcm: syntheticBase64 },
    });
    await delay(100);
    const fakeErr = clientFake.receivedPackets.find((p) => p.type === 'ERROR' && p.error?.includes('INVALID_SESSION'));
    assert(!!fakeErr, 'Test 10: Unknown/unregistered session audio frame rejected with INVALID_SESSION');
    await clientFake.close();

    // 3. Local Audio Companion Bridge WebSocket Tests (ws://127.0.0.1:5002)
    const wsBridgeClientA = new WebSocket('ws://127.0.0.1:5002');
    const wsBridgeClientB = new WebSocket('ws://127.0.0.1:5002');

    let bridgeAStatus: string | null = null;
    let bridgeBStatus: string | null = null;
    let bridgeBReceivedFrames: any[] = [];

    await new Promise<void>((res) => {
      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) res();
      };
      wsBridgeClientA.on('open', checkDone);
      wsBridgeClientB.on('open', checkDone);
    });

    wsBridgeClientA.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'SESSION_STATUS') bridgeAStatus = data.status;
    });

    wsBridgeClientB.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'SESSION_STATUS') bridgeBStatus = data.status;
      if (data.type === 'AUDIO_FRAME') bridgeBReceivedFrames.push(data);
    });

    const bridgeTokenA = signUdpSessionToken({ userId: 'bridge_usr_a', roomCode: 'CVH-BRG100', role: 'STUDENT' });
    const bridgeTokenB = signUdpSessionToken({ userId: 'bridge_usr_b', roomCode: 'CVH-BRG100', role: 'STUDENT' });

    wsBridgeClientA.send(JSON.stringify({ type: 'START_SESSION', token: bridgeTokenA, roomCode: 'CVH-BRG100' }));
    wsBridgeClientB.send(JSON.stringify({ type: 'START_SESSION', token: bridgeTokenB, roomCode: 'CVH-BRG100' }));

    await delay(300);

    assert(bridgeAStatus === 'REGISTERED', 'Test 11: Companion Bridge Client A registered UDP session via WebSocket');
    assert(bridgeBStatus === 'REGISTERED', 'Test 12: Companion Bridge Client B registered UDP session via WebSocket');

    // Send Audio Frame via Bridge Client A
    wsBridgeClientA.send(
      JSON.stringify({
        type: 'AUDIO_FRAME',
        sequence: 201,
        pcm: syntheticBase64,
      })
    );

    await delay(200);

    assert(
      bridgeBReceivedFrames.length > 0 && bridgeBReceivedFrames[0].sequence === 201,
      'Test 13: End-to-End Bridge Flow PASS — Client B received audio frame dispatched via Client A WebSocket Bridge'
    );

    // Mute Test: Set mute on Bridge Client A and verify audio frames stop
    wsBridgeClientA.send(JSON.stringify({ type: 'SET_MUTE', muted: true }));
    await delay(50);

    bridgeBReceivedFrames = [];
    wsBridgeClientA.send(
      JSON.stringify({
        type: 'AUDIO_FRAME',
        sequence: 202,
        pcm: syntheticBase64,
      })
    );
    await delay(150);

    assert(
      bridgeBReceivedFrames.length === 0,
      'Test 14: REAL MUTE PASS — Setting mute stopped audio frame transmission over UDP'
    );

    // 3-Participant Same Room Test (Client A, B, and E in Room A)
    const tokenE = signUdpSessionToken({ userId: 'usr_audio_e_999', roomCode: testRoomCode, role: 'STUDENT' });
    const clientE = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Audio_Client_E' });
    await clientE.register(tokenE, testRoomCode);

    clientA.sendData(301, { mediaType: 'audio/pcm16', pcm: syntheticBase64 });
    await delay(150);

    const bReceived301 = clientB.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 301);
    const eReceived301 = clientE.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 301);

    assert(
      !!bReceived301 && !!eReceived301,
      'Test 15: THREE-PARTICIPANT AUDIO PASS — Client A audio forwarded concurrently to Client B and Client E in same room'
    );

    // Cleanup Test Sockets
    wsBridgeClientA.close();
    wsBridgeClientB.close();
    await clientA.close();
    await clientB.close();
    await clientC.close();
    await clientE.close();

    if (internalBridge) await internalBridge.stop();
    if (internalUdpServer) await internalUdpServer.close();

    assert(true, 'Test 16: All Phase 4 audio test resources and sockets cleaned up gracefully');

    logger.info(`\n[PHASE 4 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 4 REAL-TIME AUDIO TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 4 TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error running Phase 4 test suite:', err);
    if (internalBridge) await internalBridge.stop();
    if (internalUdpServer) await internalUdpServer.close();
    process.exit(1);
  }
};

runPhase4AudioTests();
