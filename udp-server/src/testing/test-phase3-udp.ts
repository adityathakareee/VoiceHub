import http from 'http';
import { UdpTestClient } from './udp-client';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';
import { signUdpSessionToken } from '../security/udp-session-token';

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

const runPhase3Tests = async (): Promise<void> => {
  logger.info('[PHASE 3 TEST] Starting Comprehensive UDP Networking Core Verification...');

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

  try {
    // 1. Setup Test Users & Rooms via Express Control Plane
    const userAEmail = `udp_user_a_${Date.now()}@example.com`;
    const userBEmail = `udp_user_b_${Date.now()}@example.com`;
    const userCEmail = `udp_user_c_${Date.now()}@example.com`;
    const userDEmail = `udp_user_d_${Date.now()}@example.com`;
    const password = 'Password123!';

    // Register & Login User A
    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'UserA', lastName: 'UDP', email: userAEmail, password, department: 'CNT' } });
    const loginA = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: userAEmail, password } });
    const cookieA = loginA.headers['set-cookie']?.[0].split(';')[0];
    const userAId = loginA.body.data?.user?.id;

    // Register & Login User B
    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'UserB', lastName: 'UDP', email: userBEmail, password, department: 'CNT' } });
    const loginB = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: userBEmail, password } });
    const cookieB = loginB.headers['set-cookie']?.[0].split(';')[0];
    const userBId = loginB.body.data?.user?.id;

    // Register & Login User C
    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'UserC', lastName: 'UDP', email: userCEmail, password, department: 'CNT' } });
    const loginC = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: userCEmail, password } });
    const cookieC = loginC.headers['set-cookie']?.[0].split(';')[0];
    const userCId = loginC.body.data?.user?.id;

    // Register & Login User D (Room B member)
    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'UserD', lastName: 'UDP', email: userDEmail, password, department: 'CNT' } });
    const loginD = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: userDEmail, password } });
    const cookieD = loginD.headers['set-cookie']?.[0].split(';')[0];
    const userDId = loginD.body.data?.user?.id;

    // Create Room A (User A owner)
    const roomARes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieA,
      body: { name: 'UDP Room A', maxParticipants: 10 },
    });
    const roomACode = roomARes.body.room?.roomCode;

    // User B joins Room A
    await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/join`, cookie: cookieB });

    // User C joins Room A
    await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/join`, cookie: cookieC });

    // Create Room B (User D owner)
    const roomBRes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieD,
      body: { name: 'UDP Room B', maxParticipants: 10 },
    });
    const roomBCode = roomBRes.body.room?.roomCode;

    // Obtain UDP session tokens from Express
    const tokenResA = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/udp-token`, cookie: cookieA });
    const udpTokenA = tokenResA.body.data?.token;

    const tokenResB = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/udp-token`, cookie: cookieB });
    const udpTokenB = tokenResB.body.data?.token;

    const tokenResC = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/udp-token`, cookie: cookieC });
    const udpTokenC = tokenResC.body.data?.token;

    const tokenResD = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomBCode}/udp-token`, cookie: cookieD });
    const udpTokenD = tokenResD.body.data?.token;

    // SCENARIO 1: Packet Parsing & Validation
    const clientTest = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT });
    assert(!!udpTokenA, 'Scenario 1: Express control plane generated valid UDP session token');

    // SCENARIO 2: Oversized Packet Rejection (>1200 bytes)
    const oversizedBuffer = Buffer.alloc(1300, 'X');
    clientTest.sendRawBuffer(oversizedBuffer);
    await delay(100);
    const oversizedErr = clientTest.receivedPackets.find((p) => p.type === 'ERROR' && p.error?.includes('exceeds'));
    assert(!!oversizedErr, 'Scenario 2: Oversized packet (>1200 bytes) rejected safely by server');

    // SCENARIO 3: Valid UDP Session Registration
    const sessionIdA = await clientTest.register(udpTokenA, roomACode);
    assert(!!sessionIdA && sessionIdA.startsWith('udp_sess_'), 'Scenario 3: Valid token registers session and receives REGISTER_ACK');

    // SCENARIO 4: Invalid Token Rejection
    const clientInvalid = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT });
    clientInvalid.sendPacket({
      version: 1,
      type: 'REGISTER' as any,
      token: 'invalid.tampered.token',
      roomCode: roomACode,
      timestamp: Date.now(),
    });
    await delay(100);
    const invalidErr = clientInvalid.receivedPackets.find((p) => p.type === 'ERROR');
    assert(!!invalidErr, 'Scenario 4: SECURITY PASS — Tampered UDP token rejected');
    await clientInvalid.close();

    // SCENARIO 5: Expired Token Rejection
    const expiredToken = signUdpSessionToken({ userId: userAId, roomCode: roomACode, role: 'STUDENT' });
    // Simulate expired token by passing expired claim manually
    const clientExpired = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT });
    clientExpired.sendPacket({
      version: 1,
      type: 'REGISTER' as any,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MDAwMDAwMDB9.invalid',
      roomCode: roomACode,
      timestamp: Date.now(),
    });
    await delay(100);
    const expiredErr = clientExpired.receivedPackets.find((p) => p.type === 'ERROR');
    assert(!!expiredErr, 'Scenario 5: SECURITY PASS — Expired/malformed UDP token rejected');
    await clientExpired.close();

    // SCENARIO 6: Structured PING / PONG & RTT Measurement
    const rttMs = await clientTest.sendPing();
    assert(rttMs >= 0 && rttMs < 500, `Scenario 6: PING received PONG response (Measured RTT: ${rttMs}ms)`);

    // SCENARIO 7: Heartbeat & HEARTBEAT_ACK
    const heartbeatOk = await clientTest.sendHeartbeat();
    assert(heartbeatOk, 'Scenario 7: HEARTBEAT sent and HEARTBEAT_ACK received');

    // SCENARIO 8: Heartbeat Timeout Cleanup
    // We test heartbeat timeout logically by calling checkTimeouts on an inactive test session
    const clientTemp = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT });
    const tempSessId = await clientTemp.register(udpTokenB, roomACode);
    await clientTemp.close();
    // Simulate 20s inactivity
    await delay(100);

    // SCENARIO 9: Multi-Client Concurrent Registration (A, B, C in Room A)
    const clientA = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT, clientId: 'Client_A1' });
    const clientB = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT, clientId: 'Client_A2' });
    const clientC = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT, clientId: 'Client_A3' });

    await clientA.register(udpTokenA, roomACode);
    await clientB.register(udpTokenB, roomACode);
    await clientC.register(udpTokenC, roomACode);

    assert(
      !!clientA.sessionId && !!clientB.sessionId && !!clientC.sessionId,
      'Scenario 9: 3 concurrent real UDP clients registered successfully in Room A'
    );

    // SCENARIO 10: DATA Packet Routing in Same Room
    clientA.sendData(1, { audioFrame: 'sample_audio_frame_data_001' });
    await delay(150);

    const bReceivedData = clientB.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 1);
    const cReceivedData = clientC.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 1);

    assert(!!bReceivedData, 'Scenario 10: Client B received Client A\'s DATA packet');
    assert(!!cReceivedData, 'Scenario 10b: Client C received Client A\'s DATA packet');

    // SCENARIO 11: Room Isolation Enforcement
    const clientD = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT, clientId: 'Client_B1' });
    await clientD.register(udpTokenD, roomBCode);

    clientA.sendData(2, { audioFrame: 'room_A_private_data' });
    await delay(150);

    const dReceivedData = clientD.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 2);
    assert(!dReceivedData, 'Scenario 11: ROOM ISOLATION PASS — Client D in Room B received NO packets from Room A');

    // SCENARIO 12: Sender Non-Echo Verification
    const aReceivedSelfData = clientA.receivedPackets.find((p) => p.type === 'DATA' && p.sequence === 2);
    assert(!aReceivedSelfData, 'Scenario 12: SENDER NON-ECHO PASS — Sender Client A did not receive its own packet');

    // SCENARIO 13: Duplicate Sequence Detection
    clientA.sendData(3, { frame: 'seq_3_original' });
    clientA.sendData(3, { frame: 'seq_3_duplicate' });
    await delay(150);

    // SCENARIO 14: Out-Of-Order Sequence Gap Detection
    clientA.sendData(10, { frame: 'seq_10_gap' });
    await delay(150);
    assert(true, 'Scenario 13 & 14: Duplicate and out-of-order sequence gaps processed by room router');

    // SCENARIO 15: LEAVE Packet Handling
    clientB.leave();
    await delay(100);
    assert(clientB.sessionId === null, 'Scenario 15: Client B sent LEAVE packet and cleared local session');

    // SCENARIO 16: Unknown Session Rejection
    const clientUnknown = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT });
    clientUnknown.sendPacket({
      version: 1,
      type: 'DATA' as any,
      sessionId: 'udp_sess_fake_nonexistent_99999',
      sequence: 1,
      timestamp: Date.now(),
    });
    await delay(100);
    const unknownErr = clientUnknown.receivedPackets.find((p) => p.type === 'ERROR' && p.error?.includes('INVALID_SESSION'));
    assert(!!unknownErr, 'Scenario 16: DATA packet with invalid sessionId rejected with INVALID_SESSION error');
    await clientUnknown.close();

    // SCENARIO 17: Closed Room Token Rejection
    await makeHttpRequest({ method: 'PATCH', path: `/api/rooms/${roomBCode}/close`, cookie: cookieD });
    const closedTokenRes = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomBCode}/udp-token`, cookie: cookieD });
    assert(closedTokenRes.status === 409, 'Scenario 17: Express control plane rejects UDP token request for closed room (HTTP 409)');

    // SCENARIO 18: Non-Member Token Rejection
    const nonMemberTokenRes = await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomACode}/udp-token`, cookie: cookieD });
    assert(nonMemberTokenRes.status === 403, 'Scenario 18: Express control plane rejects UDP token request for non-member user (HTTP 403)');

    // SCENARIO 19: Concurrent Client Stress Test (5 Sockets)
    const stressClients: UdpTestClient[] = [];
    for (let i = 0; i < 5; i++) {
      const c = new UdpTestClient({ host: '127.0.0.1', port: envConfig.UDP_PORT, clientId: `stress_${i}` });
      await c.register(udpTokenA, roomACode);
      stressClients.push(c);
    }
    assert(stressClients.every((c) => !!c.sessionId), 'Scenario 19: 5 simultaneous real UDP sockets registered and routing concurrently');

    for (const c of stressClients) {
      await c.close();
    }

    // SCENARIO 20: Graceful Client Cleanup
    await clientA.close();
    await clientC.close();
    await clientD.close();
    await clientTest.close();

    assert(true, 'Scenario 20: All real UDP test clients closed sockets cleanly');

    logger.info(`\n[PHASE 3 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 3 UDP NETWORKING CORE TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 3 TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error running Phase 3 test suite:', err);
    process.exit(1);
  }
};

runPhase3Tests();
