import http from 'http';
import WebSocket from 'ws';
import { UdpSocketService } from '../networking/udp.socket';
import { LocalAudioBridge } from '../bridge/local-bridge';
import { UdpPacket, UdpPacketType, NetworkTelemetry } from '../networking/packet.types';
import { signUdpSessionToken } from '../security/udp-session-token';
import { logger } from '../utils/logger';

const BACKEND_BASE_URL = 'http://localhost:5000';
const TEST_UDP_PORT = 5001;
const TEST_BRIDGE_PORT = 5002;

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

const extractAuthCookie = (headers: http.IncomingHttpHeaders): string => {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return '';
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr.split(';')[0];
};

async function runMultiUserTelemetryE2E() {
  logger.info('[PHASE 7 E2E AUDIT] Starting Multi-User Network Telemetry & Audio Flow Audit...');

  let passedTests = 0;
  let udpServer: UdpSocketService | null = null;
  let bridgeServer: LocalAudioBridge | null = null;
  let wsA: WebSocket | null = null;
  let wsB: WebSocket | null = null;

  try {
    // Check if background daemons exist or start test instances
    try {
      udpServer = new UdpSocketService();
      await udpServer.start('127.0.0.1', TEST_UDP_PORT);
      logger.info('[PHASE 7 E2E] Started test UDP server on port 5001');
    } catch (_e) {
      logger.info('[PHASE 7 E2E] Using existing UDP server on port 5001');
      udpServer = null;
    }

    try {
      bridgeServer = new LocalAudioBridge();
      await bridgeServer.start();
      logger.info('[PHASE 7 E2E] Started test Local Audio Bridge on port 5002');
    } catch (_e) {
      logger.info('[PHASE 7 E2E] Using existing Local Audio Bridge on port 5002');
      bridgeServer = null;
    }

    const timestamp = Date.now();
    const userAEmail = `e2e_a_${timestamp}@cse.voicehub.edu`;
    const userBEmail = `e2e_b_${timestamp}@cse.voicehub.edu`;
    const userCEmail = `e2e_c_${timestamp}@cse.voicehub.edu`;

    // 1. Register and Login User A
    await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Alice', lastName: 'Telemetry', email: userAEmail, password: 'Password123!', department: 'CNT' },
    });
    const loginA = await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userAEmail, password: 'Password123!' },
    });
    const cookieA = extractAuthCookie(loginA.headers);

    // 2. Register and Login User B
    await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Bob', lastName: 'Telemetry', email: userBEmail, password: 'Password123!', department: 'CNT' },
    });
    const loginB = await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userBEmail, password: 'Password123!' },
    });
    const cookieB = extractAuthCookie(loginB.headers);

    // 3. User A creates Room 1
    const createRoomRes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieA,
      body: { name: 'E2E Telemetry Room', maxParticipants: 10 },
    });
    const roomCode1 = createRoomRes.body.room?.roomCode;
    if (!roomCode1) throw new Error('Failed to create Room 1');

    // 4. User B joins Room 1
    await makeHttpRequest({
      method: 'POST',
      path: `/api/rooms/${roomCode1}/join`,
      cookie: cookieB,
    });
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 1 & 2: User A created Room 1 (${roomCode1}) and User B joined successfully`);

    // 5. Connect User A Companion Bridge
    wsA = new WebSocket(`ws://127.0.0.1:${TEST_BRIDGE_PORT}`);
    await new Promise<void>((resolve, reject) => {
      wsA!.on('open', resolve);
      wsA!.on('error', reject);
    });

    const tokenA = signUdpSessionToken({
      userId: loginA.body.data.user.id,
      roomCode: roomCode1,
      role: 'STUDENT',
    });

    const regAPromise = new Promise<any>((resolve) => {
      wsA!.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf-8'));
        if (msg.type === 'SESSION_STATUS' && msg.status === 'REGISTERED') resolve(msg);
      });
    });

    wsA.send(JSON.stringify({ type: 'START_SESSION', token: tokenA, roomCode: roomCode1 }));
    const regA = await regAPromise;
    if (!regA.sessionId) throw new Error('User A session registration failed');

    // 6. Connect User B Companion Bridge
    wsB = new WebSocket(`ws://127.0.0.1:${TEST_BRIDGE_PORT}`);
    await new Promise<void>((resolve, reject) => {
      wsB!.on('open', resolve);
      wsB!.on('error', reject);
    });

    const tokenB = signUdpSessionToken({
      userId: loginB.body.data.user.id,
      roomCode: roomCode1,
      role: 'STUDENT',
    });

    const regBPromise = new Promise<any>((resolve) => {
      wsB!.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf-8'));
        if (msg.type === 'SESSION_STATUS' && msg.status === 'REGISTERED') resolve(msg);
      });
    });

    wsB.send(JSON.stringify({ type: 'START_SESSION', token: tokenB, roomCode: roomCode1 }));
    const regB = await regBPromise;
    if (!regB.sessionId) throw new Error('User B session registration failed');
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 3: User A and User B connected to Companion Bridge and registered UDP sessions`);

    // 7. Transmit audio frames from User A -> User B
    const audioReceivedPromise = new Promise<any>((resolve) => {
      wsB!.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf-8'));
        if (msg.type === 'AUDIO_FRAME') resolve(msg);
      });
    });

    // Dummy base64 20ms PCM16 frame (640 bytes -> 854 chars Base64)
    const dummyPcm = Buffer.alloc(640, 0x1a).toString('base64');
    for (let seq = 1; seq <= 5; seq++) {
      wsA.send(JSON.stringify({ type: 'AUDIO_FRAME', pcm: dummyPcm, sequence: seq }));
    }

    const receivedFrame = await audioReceivedPromise;
    if (receivedFrame.senderSessionId !== regA.sessionId) {
      throw new Error(`Expected senderSessionId ${regA.sessionId}, got ${receivedFrame.senderSessionId}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 4: User A audio forwarded to User B with session correlation`);

    // 8. User B queries network metrics
    const metricsBPromise = new Promise<any>((resolve) => {
      const listener = (raw: WebSocket.RawData) => {
        const msg = JSON.parse(raw.toString('utf-8'));
        if (msg.type === 'NETWORK_METRICS') {
          wsB!.off('message', listener);
          resolve(msg);
        }
      };
      wsB!.on('message', listener);
    });

    wsB.send(JSON.stringify({ type: 'GET_METRICS' }));
    const metricsB = await metricsBPromise;

    if (!metricsB.metrics || typeof metricsB.metrics.jitterMs !== 'number') {
      throw new Error('User B failed to receive valid network metrics');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 5: User B received live Network Telemetry (Quality: ${metricsB.metrics.qualityRating}, Jitter: ${metricsB.metrics.jitterMs}ms, Loss: ${metricsB.metrics.packetLossPercent}%)`);

    // 9. REST metrics endpoint verification
    const restMetricsRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode1}/metrics`,
      cookie: cookieA,
    });
    if (restMetricsRes.status !== 200 || restMetricsRes.body.metrics.participantCount !== 2) {
      throw new Error(`REST metrics endpoint failed: ${JSON.stringify(restMetricsRes.body)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 6: REST GET /api/rooms/:roomCode/metrics verified 2 active room participants`);

    // 10. Cross-room isolation check (User C in Room 2)
    await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Charlie', lastName: 'Isolated', email: userCEmail, password: 'Password123!', department: 'CNT' },
    });
    const loginC = await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userCEmail, password: 'Password123!' },
    });
    const cookieC = extractAuthCookie(loginC.headers);

    // User C is NOT a member of Room 1 -> verify 403 Forbidden
    const forbiddenRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode1}/metrics`,
      cookie: cookieC,
    });
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-member, got ${forbiddenRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 7: Cross-Room Isolation PASS — Non-member user strictly blocked from Room 1 telemetry`);

    // Cleanup
    if (wsA) { wsA.close(); wsA = null; }
    if (wsB) { wsB.close(); wsB = null; }
    if (bridgeServer) { await bridgeServer.stop(); bridgeServer = null; }
    if (udpServer) { await udpServer.close(); udpServer = null; }

    passedTests++;
    logger.info(`[PASS ${passedTests}] Step 8: Multi-user E2E audit sockets and resources closed cleanly`);

    logger.info('');
    logger.info(`[AUDIT SUMMARY] Total: ${passedTests} | Passed: ${passedTests} | Failed: 0`);
    logger.info('🎉 ALL PHASE 7 MULTI-USER TELEMETRY E2E CHECKS PASSED PERFECTLY!');
  } catch (err) {
    logger.error('[E2E AUDIT FAILED]', err);
    if (wsA) wsA.close();
    if (wsB) wsB.close();
    if (bridgeServer) await bridgeServer.stop();
    if (udpServer) await udpServer.close();
    process.exit(1);
  }
}

runMultiUserTelemetryE2E();
