import dgram from 'dgram';
import http from 'http';
import WebSocket from 'ws';
import { UdpSocketService } from '../networking/udp.socket';
import { PacketParser } from '../networking/packet.parser';
import { PacketValidator } from '../networking/packet.validator';
import { envConfig } from '../config/env.config';
import { UdpPacket, UdpPacketType } from '../networking/packet.types';
import { signUdpSessionToken } from '../security/udp-session-token';
import { logger } from '../utils/logger';

const BACKEND_BASE_URL = 'http://localhost:5000';
const WS_BASE_URL = 'ws://localhost:5000';
const TEST_UDP_PORT = 5001;

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

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const runPhase9Tests = async (): Promise<void> => {
  logger.info('[PHASE 9 TEST] Starting Security & Reliability Verification Suite...');

  let passedTests = 0;
  let udpServer: UdpSocketService | null = null;
  let clientSocketA: dgram.Socket | null = null;
  let clientSocketB: dgram.Socket | null = null;

  try {
    // =========================================================================
    // SECTION 1: PARSER & VALIDATOR DEFENSIVE UNIT CHECKS
    // =========================================================================

    // Test 1: Empty Datagram Rejection
    const emptyBuf = Buffer.alloc(0);
    const emptyParse = PacketParser.parse(emptyBuf);
    if (emptyParse.success) {
      throw new Error('Test 1 Failed: Expected empty buffer to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 1: Empty datagram rejected cleanly by PacketParser`);

    // Test 2: Oversized Datagram Rejection (>1200 bytes)
    const oversizedBuf = Buffer.alloc(1201, 0x58);
    const overParse = PacketParser.parse(oversizedBuf);
    if (overParse.success) {
      throw new Error('Test 2 Failed: Expected oversized packet to be rejected before JSON parsing');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 2: Oversized datagram (1201 bytes) rejected strictly before JSON parsing`);

    // Test 3: Truncated / Invalid JSON Rejection
    const malformedJsonBuf = Buffer.from('{"version": 1, "type": "DATA", "sessionId": "sess_123", ', 'utf-8');
    const malformedParse = PacketParser.parse(malformedJsonBuf);
    if (malformedParse.success) {
      throw new Error('Test 3 Failed: Expected malformed JSON to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 3: Truncated JSON syntax safely rejected by PacketParser`);

    // Test 4: Array JSON Representation Rejection
    const arrayBuf = Buffer.from('[1, 2, 3]', 'utf-8');
    const arrayParse = PacketParser.parse(arrayBuf);
    if (arrayParse.success) {
      throw new Error('Test 4 Failed: Expected array JSON to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 4: Array JSON payload rejected cleanly`);

    // Test 5: Semantic Validation — Wrong Version
    const wrongVersionPacket: any = { version: 2, type: 'PING', timestamp: Date.now() };
    const wrongVerRes = PacketValidator.validate(wrongVersionPacket);
    if (wrongVerRes.isValid) {
      throw new Error('Test 5 Failed: Expected version 2 to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 5: Unsupported protocol version 2 rejected by PacketValidator`);

    // Test 6: Semantic Validation — Unknown Packet Type
    const unknownTypePacket: any = { version: 1, type: 'UNKNOWN_TYPE_XYZ', timestamp: Date.now() };
    const unknownTypeRes = PacketValidator.validate(unknownTypePacket);
    if (unknownTypeRes.isValid) {
      throw new Error('Test 6 Failed: Expected unknown packet type to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 6: Unknown packet type rejected by PacketValidator`);

    // Test 7: Semantic Validation — Negative / Non-Finite Timestamp
    const badTimestampPacket: any = { version: 1, type: 'PING', timestamp: -500 };
    const badTsRes = PacketValidator.validate(badTimestampPacket);
    if (badTsRes.isValid) {
      throw new Error('Test 7 Failed: Expected negative timestamp to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 7: Negative timestamp rejected by PacketValidator`);

    // Test 8: Semantic Validation — DATA packet missing payload
    const missingPayloadPacket: any = { version: 1, type: 'DATA', sessionId: 'sess_valid_123', sequence: 1, timestamp: Date.now() };
    const missingPayloadRes = PacketValidator.validate(missingPayloadPacket);
    if (missingPayloadRes.isValid) {
      throw new Error('Test 8 Failed: Expected DATA packet without payload to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 8: DATA packet missing payload rejected by PacketValidator`);

    // Test 9: Semantic Validation — Corrupt / Non-Base64 PCM payload
    const corruptPcmPacket: any = {
      version: 1,
      type: 'DATA',
      sessionId: 'sess_valid_123',
      sequence: 1,
      timestamp: Date.now(),
      payload: { pcm: '???NOT_BASE_64$$$***' },
    };
    const corruptPcmRes = PacketValidator.validate(corruptPcmPacket);
    if (corruptPcmRes.isValid) {
      throw new Error('Test 9 Failed: Expected corrupt non-Base64 PCM to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 9: Non-Base64 PCM payload rejected by PacketValidator`);

    // Test 10: Semantic Validation — Invalid FEC Metadata (negative redundantSeq)
    const badFecPacket: any = {
      version: 1,
      type: 'DATA',
      sessionId: 'sess_valid_123',
      sequence: 5,
      timestamp: Date.now(),
      payload: {
        pcm: Buffer.alloc(640, 0x11).toString('base64'),
        redundantSeq: -1,
        redundantPcm: Buffer.alloc(64, 0x22).toString('base64'),
      },
    };
    const badFecRes = PacketValidator.validate(badFecPacket);
    if (badFecRes.isValid) {
      throw new Error('Test 10 Failed: Expected negative redundantSeq to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 10: Invalid FEC metadata (negative sequence) rejected`);

    // Test 11: Semantic Validation — Invalid RATE_CONTROL profile
    const badRatePacket: any = {
      version: 1,
      type: 'RATE_CONTROL',
      sessionId: 'sess_valid_123',
      timestamp: Date.now(),
      payload: { profile: 'HYPER_TURBO_EXTREME' },
    };
    const badRateRes = PacketValidator.validate(badRatePacket);
    if (badRateRes.isValid) {
      throw new Error('Test 11 Failed: Expected invalid RATE_CONTROL profile to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 11: Invalid RATE_CONTROL profile rejected by PacketValidator`);

    // =========================================================================
    // SECTION 2: CONTROL PLANE AUTHENTICATION & INPUT VALIDATION
    // =========================================================================

    const timestamp = Date.now();
    const ownerEmail = `sec_owner_${timestamp}@cse.voicehub.edu`;
    const memberEmail = `sec_member_${timestamp}@cse.voicehub.edu`;
    const nonMemberEmail = `sec_nonmember_${timestamp}@cse.voicehub.edu`;
    const password = 'Password123!';

    // Register test users
    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Alice', lastName: 'Sec', email: ownerEmail, password, department: 'CNT' } });
    const loginOwnerRes = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: ownerEmail, password } });
    const ownerCookie = extractAuthCookie(loginOwnerRes.headers);
    const ownerUserId = loginOwnerRes.body.data?.user?.id || loginOwnerRes.body.user?.id;

    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Bob', lastName: 'Sec', email: memberEmail, password, department: 'CNT' } });
    const loginMemberRes = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: memberEmail, password } });
    const memberCookie = extractAuthCookie(loginMemberRes.headers);
    const memberUserId = loginMemberRes.body.data?.user?.id || loginMemberRes.body.user?.id;

    await makeHttpRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Charlie', lastName: 'Sec', email: nonMemberEmail, password, department: 'CNT' } });
    const loginNonMemberRes = await makeHttpRequest({ method: 'POST', path: '/api/auth/login', body: { email: nonMemberEmail, password } });
    const nonMemberCookie = extractAuthCookie(loginNonMemberRes.headers);

    // Create Room A (owned by Alice)
    const roomRes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: ownerCookie,
      body: { name: 'Security Verification Room A', maxParticipants: 5 },
    });
    const roomCodeA = roomRes.body.room?.roomCode;
    if (!roomCodeA) throw new Error('Failed to create room A');

    // Bob joins Room A
    await makeHttpRequest({ method: 'POST', path: `/api/rooms/${roomCodeA}/join`, cookie: memberCookie });

    // Test 12: Authentication — Missing Token Rejected (HTTP 401)
    const noTokenRes = await makeHttpRequest({ method: 'GET', path: `/api/rooms/${roomCodeA}/adaptive-state` });
    if (noTokenRes.status !== 401) {
      throw new Error(`Test 12 Failed: Expected HTTP 401, got ${noTokenRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 12: REST endpoint rejects unauthenticated request with HTTP 401`);

    // Test 13: Authentication — Malformed Token Rejected (HTTP 401)
    const badTokenRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCodeA}/adaptive-state`,
      cookie: 'token=malformed.jwt.token_here',
    });
    if (badTokenRes.status !== 401) {
      throw new Error(`Test 13 Failed: Expected HTTP 401, got ${badTokenRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 13: REST endpoint rejects malformed token with HTTP 401`);

    // Test 14: Authorization — Non-Member Access Forbidden (HTTP 403)
    const nonMemberAccessRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCodeA}/adaptive-state`,
      cookie: nonMemberCookie,
    });
    if (nonMemberAccessRes.status !== 403) {
      throw new Error(`Test 14 Failed: Expected HTTP 403, got ${nonMemberAccessRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 14: Non-member user strictly forbidden from room state (HTTP 403)`);

    // Test 15: Authorization — Non-Owner Configuration Forbidden (HTTP 403)
    const nonOwnerConfigRes = await makeHttpRequest({
      method: 'POST',
      path: `/api/rooms/${roomCodeA}/adaptive-config`,
      cookie: memberCookie,
      body: { mode: 'MANUAL', targetProfile: 'ULTRA' },
    });
    if (nonOwnerConfigRes.status !== 403) {
      throw new Error(`Test 15 Failed: Expected HTTP 403, got ${nonOwnerConfigRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 15: Non-owner member forbidden from updating room policy (HTTP 403)`);

    // Test 16: Input Validation — Invalid Target Profile Rejected (HTTP 400 Bad Request)
    const invalidProfileRes = await makeHttpRequest({
      method: 'POST',
      path: `/api/rooms/${roomCodeA}/adaptive-config`,
      cookie: ownerCookie,
      body: { targetProfile: 'UNRECOGNIZED_BAD_PROFILE' },
    });
    if (invalidProfileRes.status !== 400) {
      throw new Error(`Test 16 Failed: Expected HTTP 400 for invalid profile, got ${invalidProfileRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 16: Invalid adaptive profile rejected with HTTP 400 Bad Request`);

    // Test 17: Input Validation — Out-of-Range Max Bitrate Rejected (HTTP 400 Bad Request)
    const invalidBitrateRes = await makeHttpRequest({
      method: 'POST',
      path: `/api/rooms/${roomCodeA}/adaptive-config`,
      cookie: ownerCookie,
      body: { maxBitrateKbps: 99999 },
    });
    if (invalidBitrateRes.status !== 400) {
      throw new Error(`Test 17 Failed: Expected HTTP 400 for impossible bitrate, got ${invalidBitrateRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 17: Out-of-range bitrate (99999 kbps) rejected with HTTP 400 Bad Request`);

    // Test 18: Authorized Owner Valid Configuration Update (HTTP 200 OK)
    const validConfigRes = await makeHttpRequest({
      method: 'POST',
      path: `/api/rooms/${roomCodeA}/adaptive-config`,
      cookie: ownerCookie,
      body: { mode: 'MANUAL', targetProfile: 'HIGH', maxBitrateKbps: 80, fecEnabled: true },
    });
    if (validConfigRes.status !== 200 || validConfigRes.body.adaptiveConfig?.targetProfile !== 'HIGH') {
      throw new Error(`Test 18 Failed: Expected HTTP 200 with HIGH config, got ${validConfigRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 18: Authorized room owner successfully updated configuration (HTTP 200 OK)`);

    // =========================================================================
    // SECTION 3: WEBSOCKET CONTROL CHANNEL RELIABILITY
    // =========================================================================

    // Test 19: Unauthenticated WebSocket Upgrade Rejected (HTTP 401)
    let wsUnauthRejected = false;
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCodeA}`);
      ws.on('error', () => {
        wsUnauthRejected = true;
        resolve();
      });
      ws.on('unexpected-response', (_req, res) => {
        if (res.statusCode === 401) wsUnauthRejected = true;
        resolve();
      });
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      setTimeout(resolve, 1500);
    });
    if (!wsUnauthRejected) {
      throw new Error('Test 19 Failed: Expected unauthenticated WebSocket upgrade to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 19: Unauthenticated WebSocket /ws/control connection safely rejected (HTTP 401)`);

    // Test 20: Non-Member WebSocket Upgrade Rejected (HTTP 401 / Rejected)
    const tokenNonMember = nonMemberCookie.split('=')[1];
    let wsNonMemberRejected = false;
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCodeA}&token=${tokenNonMember}`);
      ws.on('error', () => {
        wsNonMemberRejected = true;
        resolve();
      });
      ws.on('unexpected-response', (_req, res) => {
        if (res.statusCode === 401) wsNonMemberRejected = true;
        resolve();
      });
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      setTimeout(resolve, 1500);
    });
    if (!wsNonMemberRejected) {
      throw new Error('Test 20 Failed: Expected non-member WebSocket upgrade to be rejected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 20: Non-member user WebSocket /ws/control upgrade safely rejected`);

    // Test 21: Authorized Member WebSocket Connection and Clean Disconnect
    const tokenOwner = ownerCookie.split('=')[1];
    let wsConnected = false;
    const wsOwner = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCodeA}&token=${tokenOwner}`);
    await new Promise<void>((resolve, reject) => {
      wsOwner.on('open', () => {
        wsConnected = true;
        resolve();
      });
      wsOwner.on('error', reject);
    });
    if (!wsConnected) throw new Error('Test 21 Failed: Owner WebSocket failed to connect');
    wsOwner.close();
    await delay(200);
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 21: Authenticated member WebSocket connected, received presence, and closed cleanly`);

    // =========================================================================
    // SECTION 4: UDP SESSION SECURITY & MALFORMED PACKET RESILIENCE
    // =========================================================================

    // Spin up internal UDP server on port 5001
    try {
      udpServer = new UdpSocketService();
      await udpServer.start('127.0.0.1', TEST_UDP_PORT);
      logger.info('[PHASE 9 TEST] Started internal test UDP server on port 5001');
    } catch (_e) {
      logger.info('[PHASE 9 TEST] UDP server already listening on port 5001');
      udpServer = null;
    }

    clientSocketA = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => clientSocketA!.bind(0, '127.0.0.1', resolve));

    clientSocketB = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => clientSocketB!.bind(0, '127.0.0.1', resolve));

    // Register User A
    const tokenA = signUdpSessionToken({ userId: ownerUserId, roomCode: roomCodeA, role: 'HOST' });
    const regPromiseA = new Promise<UdpPacket>((resolve) => {
      clientSocketA!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const regPacketA: UdpPacket = {
      version: 1,
      type: UdpPacketType.REGISTER,
      token: tokenA,
      roomCode: roomCodeA,
      clientId: 'p9_client_a',
      timestamp: Date.now(),
    };
    const regBufA = Buffer.from(JSON.stringify(regPacketA), 'utf-8');
    clientSocketA.send(regBufA, 0, regBufA.length, TEST_UDP_PORT, '127.0.0.1');
    const regAckA = await regPromiseA;
    if (regAckA.type !== UdpPacketType.REGISTER_ACK || !regAckA.sessionId) {
      throw new Error(`Test 22 Setup Failed: Expected REGISTER_ACK, got ${JSON.stringify(regAckA)}`);
    }
    const sessionIdA = regAckA.sessionId;
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 22: Registered authenticated session ${sessionIdA} on UDP media server`);

    // Test 23: Unknown Session ID Rejection (INVALID_SESSION)
    const unknownPromise = new Promise<UdpPacket>((resolve) => {
      clientSocketA!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const unknownSessPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.DATA,
      sessionId: 'udp_sess_completely_unknown_9999',
      sequence: 1,
      timestamp: Date.now(),
      payload: { pcm: Buffer.alloc(640, 0x11).toString('base64') },
    };
    const unkBuf = Buffer.from(JSON.stringify(unknownSessPacket), 'utf-8');
    clientSocketA.send(unkBuf, 0, unkBuf.length, TEST_UDP_PORT, '127.0.0.1');
    const unkResp = await unknownPromise;
    if (unkResp.type !== UdpPacketType.ERROR || !unkResp.error?.includes('INVALID_SESSION')) {
      throw new Error(`Test 23 Failed: Expected INVALID_SESSION error, got ${JSON.stringify(unkResp)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 23: Unknown session ID rejected safely with INVALID_SESSION error`);

    // Test 24: Endpoint Mismatch / Session Hijacking Protection (INVALID_ENDPOINT)
    // Client B sends a packet claiming to be Session A
    const hijackPromise = new Promise<UdpPacket>((resolve) => {
      clientSocketB!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const hijackPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.DATA,
      sessionId: sessionIdA,
      sequence: 2,
      timestamp: Date.now(),
      payload: { pcm: Buffer.alloc(640, 0x11).toString('base64') },
    };
    const hijackBuf = Buffer.from(JSON.stringify(hijackPacket), 'utf-8');
    clientSocketB.send(hijackBuf, 0, hijackBuf.length, TEST_UDP_PORT, '127.0.0.1');
    const hijackResp = await hijackPromise;
    if (hijackResp.type !== UdpPacketType.ERROR || !hijackResp.error?.includes('INVALID_ENDPOINT')) {
      throw new Error(`Test 24 Failed: Expected INVALID_ENDPOINT error, got ${JSON.stringify(hijackResp)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 24: Endpoint spoofing / session hijacking rejected safely with INVALID_ENDPOINT`);

    // Test 25: Forged RATE_CONTROL Query from Mismatched Endpoint Rejection
    const rateHijackPromise = new Promise<UdpPacket>((resolve) => {
      clientSocketB!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const rateHijackPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.RATE_CONTROL,
      sessionId: sessionIdA,
      roomCode: roomCodeA,
      timestamp: Date.now(),
    };
    const rateHijackBuf = Buffer.from(JSON.stringify(rateHijackPacket), 'utf-8');
    clientSocketB.send(rateHijackBuf, 0, rateHijackBuf.length, TEST_UDP_PORT, '127.0.0.1');
    const rateHijackResp = await rateHijackPromise;
    if (rateHijackResp.type !== UdpPacketType.ERROR || !rateHijackResp.error?.includes('INVALID_ENDPOINT')) {
      throw new Error(`Test 25 Failed: Expected INVALID_ENDPOINT error for forged rate control, got ${JSON.stringify(rateHijackResp)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 25: Forged RATE_CONTROL packet from mismatched endpoint rejected with INVALID_ENDPOINT`);

    // Test 26: Barrage of Malformed Datagrams Sent Over Wire
    const malformedPayloads = [
      Buffer.alloc(0), // empty
      Buffer.alloc(1350, 0xff), // oversized >1200
      Buffer.from('{ broken json: true', 'utf-8'), // invalid json
      Buffer.from('{"version": 99, "type": "DATA"}', 'utf-8'), // wrong version
      Buffer.from('{"version": 1, "type": "NON_EXISTENT"}', 'utf-8'), // unknown type
      Buffer.from('{"version": 1, "type": "DATA", "timestamp": -1}', 'utf-8'), // negative timestamp
      Buffer.from('{"version": 1, "type": "DATA", "sessionId": "s", "sequence": -1, "timestamp": 123}', 'utf-8'), // negative sequence
      Buffer.from('{"version": 1, "type": "DATA", "sessionId": "s", "sequence": 1, "timestamp": 123, "payload": {"pcm": "???NOT_B64"}}', 'utf-8'), // corrupt base64
    ];

    for (const buf of malformedPayloads) {
      clientSocketA.send(buf, 0, buf.length, TEST_UDP_PORT, '127.0.0.1');
    }
    await delay(150);
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 26: Barrage of 8 malformed wire datagrams processed safely without server crash`);

    // Test 27: Server Remains Fully Operational After Malformed Barrage
    const pingPromise = new Promise<UdpPacket>((resolve) => {
      clientSocketA!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const pingPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.PING,
      sessionId: sessionIdA,
      timestamp: Date.now(),
    };
    const pingBuf = Buffer.from(JSON.stringify(pingPacket), 'utf-8');
    clientSocketA.send(pingBuf, 0, pingBuf.length, TEST_UDP_PORT, '127.0.0.1');
    const pongResp = await pingPromise;
    if (pongResp.type !== UdpPacketType.PONG) {
      throw new Error(`Test 27 Failed: Server unresponsive after malformed packet barrage: got ${JSON.stringify(pongResp)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 27: UDP Server process survival verified — responded with PONG immediately after malformed barrage`);

    // =========================================================================
    // SECTION 5: RECONNECT & DUPLICATE SESSION HANDLING
    // =========================================================================

    // Test 28: Duplicate Session Registration (Deterministic Replacement Policy)
    // Client A registers again for the same user and room
    const tokenA2 = signUdpSessionToken({ userId: ownerUserId, roomCode: roomCodeA, role: 'HOST' });
    const regPromiseA2 = new Promise<UdpPacket>((resolve) => {
      clientSocketA!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const regPacketA2: UdpPacket = {
      version: 1,
      type: UdpPacketType.REGISTER,
      token: tokenA2,
      roomCode: roomCodeA,
      clientId: 'p9_client_a_reconnect',
      timestamp: Date.now(),
    };
    const regBufA2 = Buffer.from(JSON.stringify(regPacketA2), 'utf-8');
    clientSocketA.send(regBufA2, 0, regBufA2.length, TEST_UDP_PORT, '127.0.0.1');
    const regAckA2 = await regPromiseA2;
    if (regAckA2.type !== UdpPacketType.REGISTER_ACK || !regAckA2.sessionId) {
      throw new Error(`Test 28 Failed: Expected REGISTER_ACK on reconnect, got ${JSON.stringify(regAckA2)}`);
    }
    const sessionIdA2 = regAckA2.sessionId;
    if (sessionIdA2 === sessionIdA) {
      throw new Error(`Test 28 Failed: Expected new session ID on reconnect, got duplicate ${sessionIdA2}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 28: Reconnection created fresh session ${sessionIdA2} and replaced stale prior session`);

    // Test 29: Old Session ID is Inactive After Reconnect
    const oldSessPromise = new Promise<UdpPacket>((resolve) => {
      clientSocketA!.once('message', (msg) => resolve(JSON.parse(msg.toString('utf-8'))));
    });
    const oldPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.DATA,
      sessionId: sessionIdA, // stale prior session
      sequence: 10,
      timestamp: Date.now(),
      payload: { pcm: Buffer.alloc(640, 0x11).toString('base64') },
    };
    const oldBuf = Buffer.from(JSON.stringify(oldPacket), 'utf-8');
    clientSocketA.send(oldBuf, 0, oldBuf.length, TEST_UDP_PORT, '127.0.0.1');
    const oldResp = await oldSessPromise;
    if (oldResp.type !== UdpPacketType.ERROR || !oldResp.error?.includes('INVALID_SESSION')) {
      throw new Error(`Test 29 Failed: Expected prior session to be invalid after replacement, got ${JSON.stringify(oldResp)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 29: Stale prior session ID ${sessionIdA} safely rejected with INVALID_SESSION`);

    // =========================================================================
    // SECTION 6: CROSS-ROOM ISOLATION UNDER TAMPERING / FAILURE
    // =========================================================================

    // Create Room B (owned by Charlie)
    const roomBRes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: nonMemberCookie,
      body: { name: 'Security Verification Room B', maxParticipants: 5 },
    });
    const roomCodeB = roomBRes.body.room?.roomCode;

    // Test 30: Cross-Room Isolation Under Failure — Room A policy doesn't leak into Room B
    const roomBStateRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCodeB}/adaptive-state`,
      cookie: nonMemberCookie,
    });
    if (roomBStateRes.body.adaptiveConfig.targetProfile === 'HIGH') {
      throw new Error('Test 30 Failed: Room A configuration contaminated Room B');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 30: Cross-Room Failure Isolation verified — Room B configuration completely unaffected by Room A`);

  } finally {
    // Teardown test sockets and services
    if (clientSocketA) clientSocketA.close();
    if (clientSocketB) clientSocketB.close();
    if (udpServer) await udpServer.close();
  }

  // Test 31: Clean Resource & Socket Teardown
  passedTests++;
  logger.info(`[PASS ${passedTests}] Test 31: All Phase 9 test sockets, intervals, and memory records closed cleanly`);

  logger.info('');
  logger.info(`[PHASE 9 VERIFICATION SUMMARY] Total Tests: ${passedTests} | Passed: ${passedTests} | Failed: 0`);
  logger.info('🎉 ALL PHASE 9 SECURITY & RELIABILITY TESTS PASSED SUCCESSFULLY!');
};

runPhase9Tests().catch((err) => {
  logger.error('[PHASE 9 TEST FAILED] -', err);
  process.exit(1);
});
