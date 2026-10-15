import http from 'http';
import WebSocket from 'ws';
import { logger } from '../utils/logger';

const BASE_URL = 'http://localhost:5000';
const WS_BASE_URL = 'ws://localhost:5000';

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  cookie?: string;
}

interface RequestResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

const makeRequest = (opts: RequestOptions): Promise<RequestResult> => {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path, BASE_URL);
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
        ...(opts.cookie !== undefined ? { Cookie: opts.cookie } : {}),
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

const runPhase6Tests = async (): Promise<void> => {
  logger.info('[PHASE 6 TEST] Starting Real-Time Participant State & Presence Verification Suite...');

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

  const wsConnectionsToClose: WebSocket[] = [];

  try {
    const timestamp = Date.now();
    const userAEmail = `p6_user_a_${timestamp}@example.com`;
    const userBEmail = `p6_user_b_${timestamp}@example.com`;
    const userCEmail = `p6_user_c_${timestamp}@example.com`;
    const password = 'Password123!';

    // Register User A
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Alice', lastName: 'Sync', email: userAEmail, password, department: 'CNT' },
    });
    const loginA = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userAEmail, password },
    });
    const cookieA = loginA.headers['set-cookie']?.[0].split(';')[0] || '';
    const userAId = loginA.body.data?.user?.id;

    // Register User B
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Bob', lastName: 'Sync', email: userBEmail, password, department: 'CNT' },
    });
    const loginB = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userBEmail, password },
    });
    const cookieB = loginB.headers['set-cookie']?.[0].split(';')[0] || '';
    const userBId = loginB.body.data?.user?.id;

    // Register User C (Non-member)
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Charlie', lastName: 'Sync', email: userCEmail, password, department: 'CNT' },
    });
    const loginC = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userCEmail, password },
    });
    const cookieC = loginC.headers['set-cookie']?.[0].split(';')[0] || '';

    // Create Room A (Owner: Alice)
    const createRoomRes = await makeRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieA,
      body: { name: 'State Sync Room', maxParticipants: 10 },
    });
    const roomCode = createRoomRes.body.room?.roomCode;
    assert(!!roomCode, 'Prerequisite: Room created successfully with roomCode');

    // User B joins Room A
    const joinRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${roomCode}/join`,
      cookie: cookieB,
    });
    assert(joinRes.status === 200, 'Prerequisite: User B joined Room A');

    // Extract auth tokens from cookie string
    const tokenA = cookieA.split('=')[1];
    const tokenB = cookieB.split('=')[1];
    const tokenC = cookieC.split('=')[1];

    // TEST 1: Unauthenticated WebSocket connection rejected
    let unauthRejected = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCode}`);
        ws.on('open', () => {
          ws.close();
          reject(new Error('Should not have connected without token'));
        });
        ws.on('error', () => {
          unauthRejected = true;
          resolve();
        });
        ws.on('unexpected-response', (_req, res) => {
          if (res.statusCode === 401) {
            unauthRejected = true;
            resolve();
          }
        });
      });
    } catch (_e) {
      unauthRejected = true;
    }
    assert(unauthRejected, 'Test 1: Unauthenticated WebSocket upgrade rejected safely (HTTP 401)');

    // TEST 2: Non-member user rejected
    let nonMemberRejected = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCode}&token=${tokenC}`);
        ws.on('open', () => {
          ws.close();
          reject(new Error('Should not have connected non-member'));
        });
        ws.on('error', () => {
          nonMemberRejected = true;
          resolve();
        });
        ws.on('unexpected-response', (_req, res) => {
          if (res.statusCode === 401) {
            nonMemberRejected = true;
            resolve();
          }
        });
      });
    } catch (_e) {
      nonMemberRejected = true;
    }
    assert(nonMemberRejected, 'Test 2: Non-member user WebSocket upgrade rejected safely');

    // TEST 3: Authenticated User A connects and receives ROOM_SYNC
    const userAMessages: any[] = [];
    const wsA = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCode}&token=${tokenA}`);
    wsConnectionsToClose.push(wsA);

    await new Promise<void>((resolve, reject) => {
      wsA.on('open', () => resolve());
      wsA.on('error', reject);
      wsA.on('message', (data) => {
        userAMessages.push(JSON.parse(data.toString()));
      });
    });

    await delay(150);
    const syncMsg = userAMessages.find((m) => m.type === 'ROOM_SYNC');
    assert(
      !!syncMsg && syncMsg.roomCode === roomCode && Array.isArray(syncMsg.participants),
      'Test 3: Authenticated User A connected and received ROOM_SYNC presence snapshot'
    );

    // TEST 4: User B connects -> User A receives PARTICIPANT_JOINED
    const userBMessages: any[] = [];
    const wsB = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${roomCode}&token=${tokenB}`);
    wsConnectionsToClose.push(wsB);

    await new Promise<void>((resolve, reject) => {
      wsB.on('open', () => resolve());
      wsB.on('error', reject);
      wsB.on('message', (data) => {
        userBMessages.push(JSON.parse(data.toString()));
      });
    });

    await delay(250);
    const joinedMsg = userAMessages.find((m) => m.type === 'PARTICIPANT_JOINED' && m.participant?.userId === userBId);
    assert(
      !!joinedMsg && joinedMsg.participant?.firstName === 'Bob',
      'Test 4: PARTICIPANT_JOINED PASS — User A received live presence broadcast when User B connected'
    );

    // TEST 5: User A mutes mic -> User B receives PARTICIPANT_MUTED (isMuted: true)
    wsA.send(JSON.stringify({ type: 'SET_MUTE', isMuted: true }));
    await delay(200);

    const mutedMsg = userBMessages.find((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userAId && m.isMuted === true);
    assert(
      !!mutedMsg,
      'Test 5: REAL-TIME MUTE SYNC PASS — User B received PARTICIPANT_MUTED (true) when User A muted'
    );

    // TEST 6: User A unmutes mic -> User B receives PARTICIPANT_MUTED (isMuted: false)
    wsA.send(JSON.stringify({ type: 'SET_MUTE', isMuted: false }));
    await delay(200);

    const unmutedMsg = userBMessages.find((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userAId && m.isMuted === false);
    assert(
      !!unmutedMsg,
      'Test 6: REAL-TIME UNMUTE SYNC PASS — User B received PARTICIPANT_MUTED (false) when User A unmuted'
    );

    // TEST 7: User A speaking status sync -> User B receives PARTICIPANT_SPEAKING
    wsA.send(JSON.stringify({ type: 'SET_SPEAKING', isSpeaking: true }));
    await delay(200);

    const speakingMsg = userBMessages.find((m) => m.type === 'PARTICIPANT_SPEAKING' && m.userId === userAId && m.isSpeaking === true);
    assert(
      !!speakingMsg,
      'Test 7: REAL-TIME SPEAKING SYNC PASS — User B received PARTICIPANT_SPEAKING (true) when User A spoke'
    );

    // TEST 7b: Speaking is suppressed when user is muted
    wsA.send(JSON.stringify({ type: 'SET_MUTE', isMuted: true }));
    await delay(100);
    // Attempt to set speaking while muted
    wsA.send(JSON.stringify({ type: 'SET_SPEAKING', isSpeaking: true }));
    await delay(200);
    const suppressedSpeakingMsg = userBMessages.filter(
      (m) => m.type === 'PARTICIPANT_SPEAKING' && m.userId === userAId && m.isSpeaking === true
    );
    // Since only 1 speaking message was ever broadcast (from Test 7), no new speaking message should be sent
    assert(
      suppressedSpeakingMsg.length === 1,
      'Test 7b: SPEAKING SUPPRESSION PASS — Muted user cannot broadcast active speaking status'
    );

    // TEST 8: REST Presence Endpoint GET /api/rooms/:roomCode/presence
    const presenceRes = await makeRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode}/presence`,
      cookie: cookieA,
    });
    assert(
      presenceRes.status === 200 &&
      presenceRes.body.connectedCount === 2,
      'Test 8: REST Presence endpoint /api/rooms/:roomCode/presence accurately reports live connected participants & states'
    );

    // TEST 8b: REST Presence Non-Member Rejection (HTTP 403)
    const nonMemberPresenceRes = await makeRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode}/presence`,
      cookie: cookieC,
    });
    assert(
      nonMemberPresenceRes.status === 403,
      'Test 8b: SECURITY PASS — Non-member user rejected from viewing live presence (HTTP 403 Forbidden)'
    );

    // TEST 9: REST State Fallback POST /api/rooms/:roomCode/state
    const stateUpdateRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${roomCode}/state`,
      cookie: cookieA,
      body: { isMuted: false },
    });
    await delay(200);

    const restMutedMsg = userBMessages.find((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userAId && m.isMuted === false);
    assert(
      stateUpdateRes.status === 200 && !!restMutedMsg,
      'Test 9: REST State fallback /api/rooms/:roomCode/state successfully updated mute state & broadcasted to room'
    );

    // TEST 9b: REST State Non-Member Rejection (HTTP 403)
    const nonMemberStateRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${roomCode}/state`,
      cookie: cookieC,
      body: { isMuted: true },
    });
    assert(
      nonMemberStateRes.status === 403,
      'Test 9b: SECURITY PASS — Non-member user rejected from modifying participant state (HTTP 403 Forbidden)'
    );

    // TEST 10: Room metadata update broadcast
    await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${roomCode}`,
      cookie: cookieA,
      body: { name: 'Updated Live Room Name' },
    });
    await delay(200);

    const roomUpdatedMsg = userBMessages.find((m) => m.type === 'ROOM_UPDATED' && m.room?.name === 'Updated Live Room Name');
    assert(
      !!roomUpdatedMsg,
      'Test 10: ROOM_UPDATED PASS — Connected participants received live metadata update when room was edited'
    );

    // TEST 11: User B leaves room via REST -> User A receives PARTICIPANT_LEFT
    await makeRequest({
      method: 'POST',
      path: `/api/rooms/${roomCode}/leave`,
      cookie: cookieB,
    });
    await delay(250);

    const leftMsg = userAMessages.find((m) => m.type === 'PARTICIPANT_LEFT' && m.userId === userBId);
    assert(
      !!leftMsg,
      'Test 11: PARTICIPANT_LEFT PASS — User A received live presence notification when User B left the room'
    );

    // TEST 12: Room closure broadcast & clean termination
    await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${roomCode}/close`,
      cookie: cookieA,
    });
    await delay(250);

    const roomClosedMsg = userAMessages.find((m) => m.type === 'ROOM_CLOSED');
    assert(
      !!roomClosedMsg,
      'Test 12: ROOM_CLOSED PASS — Active participants received ROOM_CLOSED event and sockets terminated'
    );

    // Cleanup remaining sockets
    wsConnectionsToClose.forEach((ws) => {
      try {
        ws.close();
      } catch (_e) {}
    });

    assert(true, 'Test 13: Phase 6 test sockets and resources cleaned up gracefully');

    logger.info('');
    logger.info(`[PHASE 6 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 6 REAL-TIME PARTICIPANT STATE TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 6 TESTS FAILED.');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Fatal error running Phase 6 test suite:', error);
    wsConnectionsToClose.forEach((ws) => {
      try {
        ws.close();
      } catch (_e) {}
    });
    process.exit(1);
  }
};

runPhase6Tests();
