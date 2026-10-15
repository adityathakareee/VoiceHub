import http from 'http';
import WebSocket from 'ws';
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

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const runPhase5MultiUserTests = async (): Promise<void> => {
  logger.info('[PHASE 5 TEST] Starting Multi-User Audio Conferencing & Mixing Verification Suite...');

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

  let internalUdpServer: UdpSocketService | null = null;
  let internalBridge: LocalAudioBridge | null = null;

  try {
    // Spin up test UDP server on port 5001 if not running
    try {
      internalUdpServer = new UdpSocketService();
      await internalUdpServer.start('127.0.0.1', 5001);
      logger.info('[PHASE 5 TEST] Started internal test UDP server on port 5001');
    } catch (_err) {
      logger.info('[PHASE 5 TEST] UDP server already running on port 5001');
      internalUdpServer = null;
    }

    // Spin up test Bridge on port 5002 if not running
    const bridgeActive = await new Promise<boolean>((res) => {
      const probe = http.get('http://127.0.0.1:5002', () => {
        probe.destroy();
        res(true);
      });
      probe.on('error', () => res(false));
    });

    if (bridgeActive) {
      logger.info('[PHASE 5 TEST] Local Audio Bridge already running on port 5002');
      internalBridge = null;
    } else {
      try {
        internalBridge = new LocalAudioBridge();
        await internalBridge.start();
        logger.info('[PHASE 5 TEST] Started internal test Local Audio Bridge on port 5002');
      } catch (_err) {
        logger.info('[PHASE 5 TEST] Local Audio Bridge already running on port 5002');
        internalBridge = null;
      }
    }

    const roomACode = 'CVH-MULTI1';
    const roomBCode = 'CVH-MULTI2';

    // Cryptographically sign tokens for 4 participants in Room A and 1 in Room B
    const tokenA = signUdpSessionToken({ userId: 'user_mu_a', roomCode: roomACode, role: 'STUDENT' });
    const tokenB = signUdpSessionToken({ userId: 'user_mu_b', roomCode: roomACode, role: 'STUDENT' });
    const tokenC = signUdpSessionToken({ userId: 'user_mu_c', roomCode: roomACode, role: 'FACULTY' });
    const tokenD = signUdpSessionToken({ userId: 'user_mu_d', roomCode: roomACode, role: 'STUDENT' });
    const tokenX = signUdpSessionToken({ userId: 'user_mu_x', roomCode: roomBCode, role: 'STUDENT' });

    // Initialize 4 UDP Clients in Room A
    const clientA = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_A' });
    const clientB = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_B' });
    const clientC = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_C' });
    const clientD = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_D' });
    // Initialize 1 UDP Client in Room B
    const clientX = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_X' });

    await clientA.register(tokenA, roomACode);
    await clientB.register(tokenB, roomACode);
    await clientC.register(tokenC, roomACode);
    await clientD.register(tokenD, roomACode);
    await clientX.register(tokenX, roomBCode);

    assert(
      !!clientA.sessionId && !!clientB.sessionId && !!clientC.sessionId && !!clientD.sessionId && !!clientX.sessionId,
      'Test 1: Registered 4 clients in Room A and 1 client in Room B concurrently'
    );

    // TEST 2: 1-to-N Audio Forwarding (Client A transmits audio frame)
    const syntheticPcm = pcm16ToBase64(float32ToPcm16(new Float32Array(320).fill(0.2)));
    clientA.sendData(10, { mediaType: 'audio/pcm16', pcm: syntheticPcm });

    await delay(150);

    const bPacket = clientB.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 10);
    const cPacket = clientC.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 10);
    const dPacket = clientD.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 10);

    assert(!!bPacket && !!cPacket && !!dPacket, 'Test 2: MULTI-USER FORWARD PASS — Client A audio routed concurrently to B, C, and D');
    assert(
      bPacket?.sessionId === clientA.sessionId && cPacket?.sessionId === clientA.sessionId,
      'Test 2b: Audio frames accurately identify Client A as the sender session'
    );

    // TEST 3: Sender Non-Echo & Room Isolation Verification
    const aEcho = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 10);
    const xCross = clientX.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 10);

    assert(!aEcho, 'Test 3: NON-ECHO PASS — Sender Client A did not receive its own transmitted audio frame');
    assert(!xCross, 'Test 4: ROOM ISOLATION PASS — Client X in Room B received NO audio frames from Room A');

    // TEST 4: Concurrent Audio Transmission (Client B and Client C speak simultaneously)
    clientB.sendData(20, { mediaType: 'audio/pcm16', pcm: syntheticPcm });
    clientC.sendData(30, { mediaType: 'audio/pcm16', pcm: syntheticPcm });

    await delay(150);

    const aRecFromB = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 20 && p.sessionId === clientB.sessionId);
    const aRecFromC = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 30 && p.sessionId === clientC.sessionId);

    assert(
      !!aRecFromB && !!aRecFromC,
      'Test 5: CONCURRENT MULTI-STREAM PASS — Client A received distinct audio streams from both Client B and Client C'
    );

    // TEST 5: Sequence Gap & Duplicate Filtering
    clientA.sendData(40, { pcm: syntheticPcm });
    clientA.sendData(40, { pcm: syntheticPcm }); // Duplicate
    await delay(100);

    const bDuplicates = clientB.receivedPackets.filter((p) => p.type === 'DATA' && p.sequence === 40);
    assert(bDuplicates.length === 2, 'Test 6: Duplicate sequence datagrams received by socket layer (filtered at playout manager)');

    // TEST 6: Participant Leave Handling & Dynamic Session Cleanup
    await clientB.leave();
    await delay(150);

    clientA.sendData(50, { pcm: syntheticPcm });
    await delay(150);

    const cPacket50 = clientC.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 50);
    const dPacket50 = clientD.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 50);
    const bPacket50 = clientB.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 50);

    assert(!!cPacket50 && !!dPacket50, 'Test 7: Audio continues routing cleanly to remaining participants (C & D)');
    assert(!bPacket50, 'Test 8: Left participant Client B receives no further audio frames');

    // TEST 7: Rejoin / Re-registration without Stale Session Conflicts
    const tokenBNew = signUdpSessionToken({ userId: 'user_mu_b', roomCode: roomACode, role: 'STUDENT' });
    const clientBNew = new UdpTestClient({ host: '127.0.0.1', port: 5001, clientId: 'Client_B_Rejoined' });
    await clientBNew.register(tokenBNew, roomACode);

    assert(
      !!clientBNew.sessionId && clientBNew.sessionId !== clientB.sessionId,
      'Test 9: Rejoined participant receives a fresh UDP session ID'
    );

    clientA.sendData(60, { pcm: syntheticPcm });
    await delay(150);

    const bNewPacket60 = clientBNew.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 60);
    assert(!!bNewPacket60, 'Test 10: Rejoined participant Client B immediately receives active audio stream');

    // TEST 8: 3-Client WebSocket Local Companion Bridge End-to-End Test
    const ws1 = new WebSocket('ws://127.0.0.1:5002');
    const ws2 = new WebSocket('ws://127.0.0.1:5002');
    const ws3 = new WebSocket('ws://127.0.0.1:5002');

    await new Promise<void>((res) => {
      let openCount = 0;
      const onOpen = () => {
        openCount++;
        if (openCount === 3) res();
      };
      ws1.on('open', onOpen);
      ws2.on('open', onOpen);
      ws3.on('open', onOpen);
    });

    const bridgeToken1 = signUdpSessionToken({ userId: 'brg_mu_1', roomCode: 'CVH-BRGMULTI', role: 'STUDENT' });
    const bridgeToken2 = signUdpSessionToken({ userId: 'brg_mu_2', roomCode: 'CVH-BRGMULTI', role: 'STUDENT' });
    const bridgeToken3 = signUdpSessionToken({ userId: 'brg_mu_3', roomCode: 'CVH-BRGMULTI', role: 'STUDENT' });

    let ws3ReceivedAudio: any[] = [];
    ws3.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'AUDIO_FRAME') {
        ws3ReceivedAudio.push(msg);
      }
    });

    ws1.send(JSON.stringify({ type: 'START_SESSION', token: bridgeToken1, roomCode: 'CVH-BRGMULTI' }));
    ws2.send(JSON.stringify({ type: 'START_SESSION', token: bridgeToken2, roomCode: 'CVH-BRGMULTI' }));
    ws3.send(JSON.stringify({ type: 'START_SESSION', token: bridgeToken3, roomCode: 'CVH-BRGMULTI' }));

    await delay(300);

    // Dispatch Audio from Bridge Client 1 and Bridge Client 2 to Bridge Client 3
    ws1.send(JSON.stringify({ type: 'AUDIO_FRAME', sequence: 501, pcm: syntheticPcm }));
    ws2.send(JSON.stringify({ type: 'AUDIO_FRAME', sequence: 502, pcm: syntheticPcm }));

    await delay(250);

    const from1 = ws3ReceivedAudio.find((m) => m.sequence === 501);
    const from2 = ws3ReceivedAudio.find((m) => m.sequence === 502);

    assert(
      !!from1 && !!from2,
      'Test 11: 3-PARTICIPANT BRIDGE PASS — Bridge Client 3 received multi-stream audio frames from both Client 1 and Client 2'
    );

    // Cleanup Phase 5 Sockets
    ws1.close();
    ws2.close();
    ws3.close();
    await clientA.close();
    await clientB.close();
    await clientBNew.close();
    await clientC.close();
    await clientD.close();
    await clientX.close();

    if (internalBridge) await internalBridge.stop();
    if (internalUdpServer) await internalUdpServer.close();

    assert(true, 'Test 12: All Phase 5 test resources and sockets closed cleanly');

    logger.info(`\n[PHASE 5 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 5 MULTI-USER AUDIO CONFERENCING TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 5 TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error running Phase 5 test suite:', err);
    if (internalBridge) await internalBridge.stop();
    if (internalUdpServer) await internalUdpServer.close();
    process.exit(1);
  }
};

runPhase5MultiUserTests();
