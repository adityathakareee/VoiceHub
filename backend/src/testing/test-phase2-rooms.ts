import http from 'http';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { Room } from '../models/room.model';
import { RoomMember, RoomMemberStatus } from '../models/room-member.model';
import { envConfig } from '../config/env.config';

const BASE_URL = 'http://localhost:5000';

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

const runPhase2Tests = async (): Promise<void> => {
  logger.info('[PHASE 2 TEST] Starting Conference Rooms & Management Verification...');

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
    // 1. Setup Test Users
    const userAEmail = `room_owner_${Date.now()}@example.com`;
    const userBEmail = `room_participant_${Date.now()}@example.com`;
    const userCEmail = `room_extra_${Date.now()}@example.com`;
    const password = 'Password123!';

    // Register User A
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Owner', lastName: 'User', email: userAEmail, password, department: 'CNT' },
    });
    const loginA = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userAEmail, password },
    });
    const cookieA = loginA.headers['set-cookie']?.[0].split(';')[0];
    const userAId = loginA.body.data?.user?.id;

    // Register User B
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Participant', lastName: 'User', email: userBEmail, password, department: 'CNT' },
    });
    const loginB = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userBEmail, password },
    });
    const cookieB = loginB.headers['set-cookie']?.[0].split(';')[0];

    // Register User C
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { firstName: 'Extra', lastName: 'User', email: userCEmail, password, department: 'CNT' },
    });
    const loginC = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userCEmail, password },
    });
    const cookieC = loginC.headers['set-cookie']?.[0].split(';')[0];

    // Login or setup Seeded Admin User
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cse.voicehub.edu';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';

    const adminLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: adminEmail, password: adminPassword },
    });
    const adminCookie = adminLogin.headers['set-cookie']?.[0].split(';')[0];

    // TEST 1: Room Creation
    const createRes = await makeRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieA,
      body: {
        name: 'Computer Networks Discussion',
        description: 'CNT project team discussion',
        maxParticipants: 10,
      },
    });

    assert(createRes.status === 201, 'Test 1: Authenticated room creation succeeds with HTTP 201', `Got status ${createRes.status}`);
    const roomA = createRes.body.room;
    assert(!!roomA?.roomCode, 'Test 2: Server generates a unique room code');
    assert(/^CVH-[A-Z2-9]{6}$/.test(roomA?.roomCode), 'Test 2b: Room code matches format CVH-XXXXXX', `Code: ${roomA?.roomCode}`);
    assert(roomA?.participantCount === 1, 'Test 3: Owner automatically becomes active member (participantCount = 1)');
    assert(roomA?.owner?.firstName === 'Owner', 'Test 3b: Owner details derived from req.user');

    const createdRoomCode = roomA.roomCode;

    // TEST 4: Get My Rooms
    const myRoomsRes = await makeRequest({
      method: 'GET',
      path: '/api/rooms/my',
      cookie: cookieA,
    });
    assert(myRoomsRes.status === 200, 'Test 4: GET /api/rooms/my succeeds (HTTP 200)');
    assert(
      myRoomsRes.body.rooms?.some((r: any) => r.roomCode === createdRoomCode),
      'Test 4b: Created room appears in owner list of rooms'
    );

    // TEST 5: Second User Join Room
    const joinRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${createdRoomCode.toLowerCase()}/join`, // Test case-normalization
      cookie: cookieB,
    });

    assert(joinRes.status === 200, 'Test 5: User B joins room via case-insensitive room code (HTTP 200)');
    assert(joinRes.body.room?.participantCount === 2, 'Test 5b: Participant count increases to 2');

    // TEST 6: Duplicate Join Prevention
    const dupJoinRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${createdRoomCode}/join`,
      cookie: cookieB,
    });

    assert(dupJoinRes.status === 200, 'Test 6: Duplicate join handled gracefully (alreadyJoined: true)');
    assert(dupJoinRes.body.alreadyJoined === true, 'Test 6b: Response indicates user is already joined');
    assert(dupJoinRes.body.room?.participantCount === 2, 'Test 6c: Participant count remains 2');

    // TEST 7: DB Partial Unique Index Verification
    let dbErrorCaught = false;
    try {
      await mongoose.connect(envConfig.MONGODB_URI);
      const activeMemberDocs = await RoomMember.find({ room: roomA.id, user: userAId, status: RoomMemberStatus.ACTIVE });
      if (activeMemberDocs.length > 0) {
        // Attempt to create duplicate active membership directly via model
        await RoomMember.create({
          room: roomA.id,
          user: userAId,
          status: RoomMemberStatus.ACTIVE,
          joinedAt: new Date(),
        });
      }
    } catch (err: any) {
      if (err.code === 11000) {
        dbErrorCaught = true;
      }
    }
    assert(
      dbErrorCaught,
      'Test 7: SECURITY & CONSISTENCY PASS — Database partial unique index rejected duplicate ACTIVE membership'
    );

    // TEST 8: Get Room Details (Member Access)
    const roomDetailsRes = await makeRequest({
      method: 'GET',
      path: `/api/rooms/${createdRoomCode}`,
      cookie: cookieB,
    });
    assert(roomDetailsRes.status === 200, 'Test 8: Active member can view room details');
    assert(roomDetailsRes.body.room?.participants?.length === 2, 'Test 8b: Member sees active participants list (2 members)');
    assert(roomDetailsRes.body.room?.participants[0]?.passwordHash === undefined, 'Test 8c: Sensitive user data not exposed');

    // TEST 9: Member Visibility (Non-Member Access)
    const nonMemberDetailsRes = await makeRequest({
      method: 'GET',
      path: `/api/rooms/${createdRoomCode}`,
      cookie: cookieC,
    });
    assert(nonMemberDetailsRes.status === 200, 'Test 9: Non-member can request room detail basic info');
    assert(
      nonMemberDetailsRes.body.room?.participants?.length === 0,
      'Test 9b: PRIVACY PASS — Non-member cannot enumerate active participant list'
    );

    // TEST 10: User Leave Room
    const leaveRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${createdRoomCode}/leave`,
      cookie: cookieB,
    });
    assert(leaveRes.status === 200, 'Test 10: User B leaves room successfully');
    assert(leaveRes.body.participantCount === 1, 'Test 10b: Participant count decreases to 1');

    // TEST 11: Non-Owner Edit Forbidden
    const nonOwnerEditRes = await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${createdRoomCode}`,
      cookie: cookieB,
      body: { name: 'Hacked Room Name' },
    });
    assert(nonOwnerEditRes.status === 403, 'Test 11: AUTHORIZATION PASS — Non-owner room edit returns HTTP 403 Forbidden');

    // TEST 12: Non-Owner Close Forbidden
    const nonOwnerCloseRes = await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${createdRoomCode}/close`,
      cookie: cookieB,
    });
    assert(nonOwnerCloseRes.status === 403, 'Test 12: AUTHORIZATION PASS — Non-owner room close returns HTTP 403 Forbidden');

    // TEST 13: Owner Room Update
    const ownerUpdateRes = await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${createdRoomCode}`,
      cookie: cookieA,
      body: {
        name: 'Updated Networks Discussion',
        description: 'Updated team discussion details',
        maxParticipants: 15,
      },
    });
    assert(ownerUpdateRes.status === 200, 'Test 13: Owner updates room successfully (HTTP 200)');
    assert(ownerUpdateRes.body.room?.name === 'Updated Networks Discussion', 'Test 13b: Room name updated');
    assert(ownerUpdateRes.body.room?.maxParticipants === 15, 'Test 13c: maxParticipants updated');

    // TEST 14: Capacity Enforcement
    const capRoomRes = await makeRequest({
      method: 'POST',
      path: '/api/rooms',
      cookie: cookieA,
      body: {
        name: 'Small Capacity Room',
        maxParticipants: 2,
      },
    });
    const capRoomCode = capRoomRes.body.room?.roomCode;

    // User B joins -> count becomes 2 (User A + User B)
    await makeRequest({ method: 'POST', path: `/api/rooms/${capRoomCode}/join`, cookie: cookieB });

    // User C tries to join -> capacity 2 reached!
    const capFullRes = await makeRequest({ method: 'POST', path: `/api/rooms/${capRoomCode}/join`, cookie: cookieC });
    assert(capFullRes.status === 409, 'Test 14: CAPACITY PASS — Joining full room rejected with HTTP 409 Conflict');
    assert(capFullRes.body.message.includes('full'), 'Test 14b: Error message specifies room is full');

    // TEST 15: Unauthenticated Access
    const unauthRes = await makeRequest({
      method: 'GET',
      path: '/api/rooms/my',
    });
    assert(unauthRes.status === 401, 'Test 15: Unauthenticated request to /api/rooms/my returns HTTP 401 Unauthorized');

    // TEST 16: Invalid Room Code
    const invalidRes = await makeRequest({
      method: 'GET',
      path: '/api/rooms/CVH-NONEXISTENT',
      cookie: cookieA,
    });
    assert(invalidRes.status === 404, 'Test 16: Nonexistent room code returns HTTP 404 Not Found');

    // TEST 17: Owner Close Room
    const closeRes = await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${createdRoomCode}/close`,
      cookie: cookieA,
    });
    assert(closeRes.status === 200, 'Test 17: Owner closes room successfully (HTTP 200)');
    assert(closeRes.body.room?.status === 'CLOSED', 'Test 17b: Room status set to CLOSED');
    assert(!!closeRes.body.room?.closedAt, 'Test 17c: closedAt timestamp populated');

    // TEST 18: Join Closed Room Forbidden
    const joinClosedRes = await makeRequest({
      method: 'POST',
      path: `/api/rooms/${createdRoomCode}/join`,
      cookie: cookieB,
    });
    assert(joinClosedRes.status === 409, 'Test 18: Joining a closed room rejected with HTTP 409 Conflict');

    // TEST 19: Admin Authorization
    const adminCloseRes = await makeRequest({
      method: 'PATCH',
      path: `/api/rooms/${capRoomCode}/close`,
      cookie: adminCookie,
    });
    assert(adminCloseRes.status === 200, 'Test 19: ADMIN can close another user\'s room successfully');

    logger.info(`\n[PHASE 2 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 2 CONFERENCE ROOM TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 2 TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error running Phase 2 test suite:', err);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
};

runPhase2Tests();
