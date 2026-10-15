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

const makeRequest = (opts: RequestOptions): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> => {
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

const runMultiUserE2e = async (): Promise<void> => {
  logger.info('[AUDIT E2E] Starting Phase 6 Multi-User Live Interaction & Isolation Audit...');

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

  const wsList: WebSocket[] = [];

  try {
    const timestamp = Date.now();
    const userAEmail = `audit_user_a_${timestamp}@example.com`;
    const userBEmail = `audit_user_b_${timestamp}@example.com`;
    const userCEmail = `audit_user_c_${timestamp}@example.com`;
    const password = 'Password123!';

    // 1. Setup User A, User B, User C
    await makeRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Alice', lastName: 'Audit', email: userAEmail, password, department: 'CNT' } });
    const logA = await makeRequest({ method: 'POST', path: '/api/auth/login', body: { email: userAEmail, password } });
    const cookieA = logA.headers['set-cookie']?.[0].split(';')[0] || '';
    const userAId = logA.body.data?.user?.id;
    const tokenA = cookieA.split('=')[1];

    await makeRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Bob', lastName: 'Audit', email: userBEmail, password, department: 'CNT' } });
    const logB = await makeRequest({ method: 'POST', path: '/api/auth/login', body: { email: userBEmail, password } });
    const cookieB = logB.headers['set-cookie']?.[0].split(';')[0] || '';
    const userBId = logB.body.data?.user?.id;
    const tokenB = cookieB.split('=')[1];

    await makeRequest({ method: 'POST', path: '/api/auth/register', body: { firstName: 'Charlie', lastName: 'Audit', email: userCEmail, password, department: 'CNT' } });
    const logC = await makeRequest({ method: 'POST', path: '/api/auth/login', body: { email: userCEmail, password } });
    const cookieC = logC.headers['set-cookie']?.[0].split(';')[0] || '';
    const userCId = logC.body.data?.user?.id;
    const tokenC = cookieC.split('=')[1];

    // 2. User A creates Room 1
    const room1Res = await makeRequest({ method: 'POST', path: '/api/rooms', cookie: cookieA, body: { name: 'Audit Room 1' } });
    const room1Code = room1Res.body.room?.roomCode;

    // User C creates Room 2 (Isolation Check)
    const room2Res = await makeRequest({ method: 'POST', path: '/api/rooms', cookie: cookieC, body: { name: 'Audit Room 2' } });
    const room2Code = room2Res.body.room?.roomCode;

    // 3. User A connects to Room 1 control channel
    const userAMessages: any[] = [];
    const wsA = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${room1Code}&token=${tokenA}`);
    wsList.push(wsA);
    wsA.on('message', (d) => userAMessages.push(JSON.parse(d.toString())));
    await delay(200);

    // 4. User C connects to Room 2 control channel
    const userCMessages: any[] = [];
    const wsC = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${room2Code}&token=${tokenC}`);
    wsList.push(wsC);
    wsC.on('message', (d) => userCMessages.push(JSON.parse(d.toString())));
    await delay(200);

    // 5. User B joins Room 1 via API and connects to Room 1 control channel
    await makeRequest({ method: 'POST', path: `/api/rooms/${room1Code}/join`, cookie: cookieB });
    const userBMessages: any[] = [];
    const wsB = new WebSocket(`${WS_BASE_URL}/ws/control?roomCode=${room1Code}&token=${tokenB}`);
    wsList.push(wsB);
    wsB.on('message', (d) => userBMessages.push(JSON.parse(d.toString())));
    await delay(250);

    // VERIFY CRITERION 1: User A sees User B appear without refresh (PARTICIPANT_JOINED)
    const bJoinedEvent = userAMessages.find((m) => m.type === 'PARTICIPANT_JOINED' && m.participant?.userId === userBId);
    assert(!!bJoinedEvent, 'Audit 1: User A sees User B appear live (PARTICIPANT_JOINED received)');

    // VERIFY CRITERION 2: User C in Room 2 did NOT receive Room 1 join event (Room Isolation)
    const cReceivedBJoin = userCMessages.some((m) => m.type === 'PARTICIPANT_JOINED' && m.participant?.userId === userBId);
    assert(!cReceivedBJoin, 'Audit 2: ROOM ISOLATION PASS — User C in Room 2 received NO presence events from Room 1');

    // VERIFY CRITERION 3: User B mutes and User A sees mute state update (PARTICIPANT_MUTED: true)
    wsB.send(JSON.stringify({ type: 'SET_MUTE', isMuted: true }));
    await delay(200);
    const bMutedEvent = userAMessages.find((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userBId && m.isMuted === true);
    assert(!!bMutedEvent, 'Audit 3: User A sees User B mute state update live (isMuted: true)');

    // VERIFY CRITERION 4: User C in Room 2 did NOT receive User B mute event
    const cReceivedBMute = userCMessages.some((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userBId);
    assert(!cReceivedBMute, 'Audit 4: ROOM ISOLATION PASS — User C in Room 2 received NO mute events from Room 1');

    // VERIFY CRITERION 5: User B unmutes and User A sees live microphone state (PARTICIPANT_MUTED: false)
    wsB.send(JSON.stringify({ type: 'SET_MUTE', isMuted: false }));
    await delay(200);
    const bUnmutedEvent = userAMessages.find((m) => m.type === 'PARTICIPANT_MUTED' && m.userId === userBId && m.isMuted === false);
    assert(!!bUnmutedEvent, 'Audit 5: User A sees User B unmute state update live (isMuted: false)');

    // VERIFY CRITERION 6: User B leaves and User A sees participant disappear (PARTICIPANT_LEFT)
    await makeRequest({ method: 'POST', path: `/api/rooms/${room1Code}/leave`, cookie: cookieB });
    await delay(250);
    const bLeftEvent = userAMessages.find((m) => m.type === 'PARTICIPANT_LEFT' && m.userId === userBId);
    assert(!!bLeftEvent, 'Audit 6: User A sees User B disappear live (PARTICIPANT_LEFT received)');

    // VERIFY CRITERION 7: User C in Room 2 did NOT receive User B leave event
    const cReceivedBLeave = userCMessages.some((m) => m.type === 'PARTICIPANT_LEFT' && m.userId === userBId);
    assert(!cReceivedBLeave, 'Audit 7: ROOM ISOLATION PASS — User C in Room 2 received NO leave events from Room 1');

    wsList.forEach((w) => {
      try {
        w.close();
      } catch (_e) {}
    });

    logger.info('');
    logger.info(`[AUDIT SUMMARY] Total: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);
    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 6 MULTI-USER AUDIT CHECKS PASSED PERFECTLY!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error during multi-user audit:', err);
    wsList.forEach((w) => {
      try {
        w.close();
      } catch (_e) {}
    });
    process.exit(1);
  }
};

runMultiUserE2e();
