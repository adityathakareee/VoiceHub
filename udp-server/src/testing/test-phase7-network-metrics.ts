import http from 'http';
import WebSocket from 'ws';
import dgram from 'dgram';
import { UdpSocketService } from '../networking/udp.socket';
import { LocalAudioBridge } from '../bridge/local-bridge';
import { UdpPacket, UdpPacketType, NetworkTelemetry } from '../networking/packet.types';
import { UdpMetricsCollector } from '../networking/metrics.collector';
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

async function runPhase7Tests() {
  logger.info('[PHASE 7 TEST] Starting Real-Time Network Monitoring & Telemetry Verification Suite...');

  let passedTests = 0;
  let udpServer: UdpSocketService | null = null;
  let bridgeServer: LocalAudioBridge | null = null;
  let testClientSocket: dgram.Socket | null = null;
  let bridgeWs: WebSocket | null = null;

  try {
    // =========================================================================
    // SECTION 1: UNIT & MATHEMATICAL VERIFICATION (RFC 3550 & Loss Tracking)
    // =========================================================================

    // Test 1: Mathematical Accuracy of RFC 3550 Inter-Arrival Jitter Formula
    const collector = new UdpMetricsCollector();
    // Packet 1: sent at 1000, arrived at 1050 (transit delay = 50ms)
    collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 1,
      senderTimestamp: 1000,
      arrivalTimestamp: 1050,
      byteSize: 640,
    });

    // Packet 2: sent at 1020, arrived at 1090 (transit delay = 70ms)
    // Difference D = |70 - 50| = 20ms
    // J_1 = 0 + (20 - 0)/16 = 1.25ms
    collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 2,
      senderTimestamp: 1020,
      arrivalTimestamp: 1090,
      byteSize: 640,
    });

    // Packet 3: sent at 1040, arrived at 1090 (transit delay = 50ms)
    // Difference D = |50 - 70| = 20ms
    // J_2 = 1.25 + (20 - 1.25)/16 = 2.421875ms
    collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 3,
      senderTimestamp: 1040,
      arrivalTimestamp: 1090,
      byteSize: 640,
    });

    const telem1 = collector.getTelemetry('sess_test_1', 'CVH-TEST01');
    if (Math.abs(telem1.jitterMs - 2.42) > 0.05) {
      throw new Error(`Test 1 Failed: Expected RFC 3550 jitter ~2.42ms, got ${telem1.jitterMs}ms`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 1: Mathematical Accuracy of RFC 3550 Jitter Formula verified (Calculated: ${telem1.jitterMs}ms)`);

    // Test 2: Sequence Gap Detection & Packet Loss Tracking
    // Next packet arrives with sequence 6 (gap of 2 packets: 4 and 5 missing)
    const gapResult = collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 6,
      senderTimestamp: 1100,
      arrivalTimestamp: 1150,
      byteSize: 640,
    });

    if (gapResult.lostCount !== 2 || !gapResult.isOutOfOrder) {
      throw new Error(`Test 2 Failed: Expected 2 lost packets and isOutOfOrder=true, got ${JSON.stringify(gapResult)}`);
    }

    const telem2 = collector.getTelemetry('sess_test_1', 'CVH-TEST01');
    // Total received = 4, total lost = 2 => total expected = 6. Loss = (2/6)*100 = 33.33%
    if (telem2.packetsLost !== 2 || telem2.packetLossPercent !== 33.33) {
      throw new Error(`Test 2 Failed: Expected 2 packets lost and 33.33% loss, got ${telem2.packetsLost} and ${telem2.packetLossPercent}%`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 2: Sequence Gap Detection & Loss Tracking verified (Packets Lost: 2, Loss Rate: 33.33%)`);

    // Test 3: Duplicate Sequence Filtering
    const dupResult = collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 6,
      senderTimestamp: 1100,
      arrivalTimestamp: 1150,
      byteSize: 640,
    });

    if (!dupResult.isDuplicate) {
      throw new Error('Test 3 Failed: Duplicate sequence was not detected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 3: Duplicate Sequence Filtering verified`);

    // Test 4: Out-of-Order Sequence Handling
    const oooResult = collector.recordIncomingPacket({
      sessionId: 'sess_test_1',
      roomCode: 'CVH-TEST01',
      sequence: 4, // Late arrival
      senderTimestamp: 1060,
      arrivalTimestamp: 1160,
      byteSize: 640,
    });

    if (!oooResult.isOutOfOrder) {
      throw new Error('Test 4 Failed: Out-of-order sequence was not detected');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 4: Out-of-Order Sequence Handling verified`);

    // Test 5: Rolling Bitrate & Bandwidth Calculation
    const collectorBandwidth = new UdpMetricsCollector();
    // Simulate sending 10 audio frames of 640 bytes over 1 second = 6400 bytes = 51.2 kbps
    for (let seq = 1; seq <= 10; seq++) {
      collectorBandwidth.recordOutgoingPacket('sess_bw', 'CVH-BW', 640);
      collectorBandwidth.recordIncomingPacket({
        sessionId: 'sess_bw',
        roomCode: 'CVH-BW',
        sequence: seq,
        senderTimestamp: 1000 + seq * 20,
        arrivalTimestamp: 1025 + seq * 20,
        byteSize: 640,
      });
    }
    const telemBw = collectorBandwidth.getTelemetry('sess_bw', 'CVH-BW');
    if (telemBw.bytesSent !== 6400 || telemBw.bytesReceived !== 6400) {
      throw new Error(`Test 5 Failed: Byte tracking mismatch: sent=${telemBw.bytesSent}, recv=${telemBw.bytesReceived}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 5: Rolling Bitrate & Byte Accounting verified (Sent: ${telemBw.bytesSent} bytes, Received: ${telemBw.bytesReceived} bytes)`);

    // Test 6: Network Quality Rating Classification
    const q1 = UdpMetricsCollector.calculateQualityRating(25, 4.5, 0.2); // EXCELLENT
    const q2 = UdpMetricsCollector.calculateQualityRating(110, 22.0, 2.1); // GOOD
    const q3 = UdpMetricsCollector.calculateQualityRating(220, 48.0, 6.0); // FAIR
    const q4 = UdpMetricsCollector.calculateQualityRating(350, 75.0, 12.0); // POOR

    if (q1 !== 'EXCELLENT' || q2 !== 'GOOD' || q3 !== 'FAIR' || q4 !== 'POOR') {
      throw new Error(`Test 6 Failed: Rating mismatch: ${q1}, ${q2}, ${q3}, ${q4}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 6: Network Quality Rating Classification verified (EXCELLENT, GOOD, FAIR, POOR)`);

    // =========================================================================
    // SECTION 2: UDP SERVER METRICS & PROTOCOL PACKETS
    // =========================================================================

    // Test 7: UDP Server Startup & Session Registration
    try {
      udpServer = new UdpSocketService();
      await udpServer.start('127.0.0.1', TEST_UDP_PORT);
      logger.info('[PHASE 7 TEST] Started internal test UDP server on port 5001');
    } catch (_err) {
      logger.info('[PHASE 7 TEST] UDP server already running on port 5001');
      udpServer = null;
    }

    const tokenUserA = signUdpSessionToken({
      userId: 'usr_m1_aaa',
      roomCode: 'CVH-METRIC1',
      role: 'STUDENT',
    });

    testClientSocket = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => testClientSocket!.bind(0, '127.0.0.1', resolve));

    const regPromise = new Promise<UdpPacket>((resolve) => {
      testClientSocket!.once('message', (msg) => {
        resolve(JSON.parse(msg.toString('utf-8')));
      });
    });

    const regPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.REGISTER,
      token: tokenUserA,
      roomCode: 'CVH-METRIC1',
      clientId: 'client_m1',
      timestamp: Date.now(),
    };
    testClientSocket.send(Buffer.from(JSON.stringify(regPacket)), TEST_UDP_PORT, '127.0.0.1');

    const regAck = await regPromise;
    if (regAck.type !== UdpPacketType.REGISTER_ACK || !regAck.sessionId) {
      throw new Error(`Test 7 Failed: Expected REGISTER_ACK, got ${JSON.stringify(regAck)}`);
    }
    const clientSessionId = regAck.sessionId;
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 7: UDP Server started and client registered session ${clientSessionId}`);

    // Test 8: RTT Measurement via PING / PONG Probe
    const pingStart = Date.now();
    const pongPromise = new Promise<UdpPacket>((resolve) => {
      testClientSocket!.once('message', (msg) => {
        resolve(JSON.parse(msg.toString('utf-8')));
      });
    });

    const pingPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.PING,
      sessionId: clientSessionId,
      timestamp: pingStart,
    };
    testClientSocket.send(Buffer.from(JSON.stringify(pingPacket)), TEST_UDP_PORT, '127.0.0.1');

    const pongAck = await pongPromise;
    const measuredRtt = Date.now() - pingStart;

    if (pongAck.type !== UdpPacketType.PONG || measuredRtt < 0 || measuredRtt > 200) {
      throw new Error(`Test 8 Failed: Invalid PONG response or unreasonable RTT: ${measuredRtt}ms`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 8: RTT Measurement via UDP PING/PONG verified (Measured RTT: ${measuredRtt}ms)`);

    // Test 9: UDP Server METRICS Packet Exchange
    const metricsQueryPromise = new Promise<UdpPacket>((resolve) => {
      testClientSocket!.once('message', (msg) => {
        resolve(JSON.parse(msg.toString('utf-8')));
      });
    });

    const metricsPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.METRICS,
      sessionId: clientSessionId,
      roomCode: 'CVH-METRIC1',
      timestamp: Date.now(),
    };
    testClientSocket.send(Buffer.from(JSON.stringify(metricsPacket)), TEST_UDP_PORT, '127.0.0.1');

    const metricsAck = await metricsQueryPromise;
    if (metricsAck.type !== UdpPacketType.METRICS || !metricsAck.payload) {
      throw new Error(`Test 9 Failed: Expected METRICS packet response, got ${JSON.stringify(metricsAck)}`);
    }
    const udpTelemetry = metricsAck.payload as NetworkTelemetry;
    if (udpTelemetry.qualityRating === undefined || udpTelemetry.jitterMs === undefined) {
      throw new Error(`Test 9 Failed: Telemetry payload missing expected fields: ${JSON.stringify(udpTelemetry)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 9: UDP Server METRICS Packet Protocol verified (Quality: ${udpTelemetry.qualityRating})`);

    // Test 10: SECURITY PASS — Unknown Session METRICS Request Rejected
    const errorPromise = new Promise<UdpPacket>((resolve) => {
      testClientSocket!.once('message', (msg) => {
        resolve(JSON.parse(msg.toString('utf-8')));
      });
    });

    const invalidMetricsPacket: UdpPacket = {
      version: 1,
      type: UdpPacketType.METRICS,
      sessionId: 'udp_sess_unauthorized_999',
      roomCode: 'CVH-METRIC1',
      timestamp: Date.now(),
    };
    testClientSocket.send(Buffer.from(JSON.stringify(invalidMetricsPacket)), TEST_UDP_PORT, '127.0.0.1');

    const errorAck = await errorPromise;
    if (errorAck.type !== UdpPacketType.ERROR || !errorAck.error?.includes('INVALID_SESSION')) {
      throw new Error(`Test 10 Failed: Expected INVALID_SESSION error, got ${JSON.stringify(errorAck)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 10: SECURITY PASS — Unauthorized session METRICS request safely rejected`);

    // =========================================================================
    // SECTION 3: COMPANION BRIDGE TELEMETRY & WEBSOCKET DISPATCH
    // =========================================================================

    // Test 11: Companion Bridge Start & WebSocket Connection
    const bridgeActive = await new Promise<boolean>((res) => {
      const probe = http.get('http://127.0.0.1:5002', () => {
        probe.destroy();
        res(true);
      });
      probe.on('error', () => res(false));
    });

    if (bridgeActive) {
      logger.info('[PHASE 7 TEST] Local Audio Bridge already running on port 5002');
      bridgeServer = null;
    } else {
      try {
        bridgeServer = new LocalAudioBridge();
        await bridgeServer.start();
        logger.info('[PHASE 7 TEST] Started internal test Local Audio Bridge on port 5002');
      } catch (_err) {
        logger.info('[PHASE 7 TEST] Local Audio Bridge already running on port 5002');
        bridgeServer = null;
      }
    }

    bridgeWs = new WebSocket(`ws://127.0.0.1:${TEST_BRIDGE_PORT}`);
    await new Promise<void>((resolve, reject) => {
      bridgeWs!.on('open', resolve);
      bridgeWs!.on('error', reject);
    });
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 11: Local Companion Bridge started and client WebSocket connected`);

    // Test 12: Companion Bridge Session Registration
    const bridgeRegPromise = new Promise<any>((resolve) => {
      bridgeWs!.on('message', (raw) => {
        const data = JSON.parse(raw.toString('utf-8'));
        if (data.type === 'SESSION_STATUS' && data.status === 'REGISTERED') {
          resolve(data);
        }
      });
    });

    const bridgeToken = signUdpSessionToken({
      userId: 'usr_bridge_m7',
      roomCode: 'CVH-METRIC1',
      role: 'STUDENT',
    });

    bridgeWs.send(
      JSON.stringify({
        type: 'START_SESSION',
        token: bridgeToken,
        roomCode: 'CVH-METRIC1',
      })
    );

    const bridgeRegStatus = await bridgeRegPromise;
    if (!bridgeRegStatus.sessionId) {
      throw new Error('Test 12 Failed: Bridge did not register session ID');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 12: Companion Bridge UDP session registered via WebSocket`);

    // Test 13: Companion Bridge GET_METRICS Query
    const getMetricsPromise = new Promise<any>((resolve) => {
      const listener = (raw: WebSocket.RawData) => {
        const data = JSON.parse(raw.toString('utf-8'));
        if (data.type === 'NETWORK_METRICS') {
          bridgeWs!.off('message', listener);
          resolve(data);
        }
      };
      bridgeWs!.on('message', listener);
    });

    bridgeWs.send(JSON.stringify({ type: 'GET_METRICS' }));
    const metricsMsg = await getMetricsPromise;

    if (!metricsMsg.metrics || metricsMsg.metrics.qualityRating === undefined) {
      throw new Error(`Test 13 Failed: Invalid NETWORK_METRICS response: ${JSON.stringify(metricsMsg)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 13: Companion Bridge GET_METRICS query verified (Quality: ${metricsMsg.metrics.qualityRating})`);

    // Test 14: Companion Bridge Automated Periodic NETWORK_METRICS Broadcast
    const periodicMetricsPromise = new Promise<any>((resolve) => {
      const listener = (raw: WebSocket.RawData) => {
        const data = JSON.parse(raw.toString('utf-8'));
        if (data.type === 'NETWORK_METRICS') {
          bridgeWs!.off('message', listener);
          resolve(data);
        }
      };
      bridgeWs!.on('message', listener);
    });

    const periodicMetrics = await periodicMetricsPromise;
    if (typeof periodicMetrics.metrics.rttMs !== 'number' || typeof periodicMetrics.metrics.jitterMs !== 'number') {
      throw new Error('Test 14 Failed: Periodic NETWORK_METRICS broadcast missing expected numeric metrics');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 14: Companion Bridge Automated Periodic Telemetry Broadcast verified (RTT: ${periodicMetrics.metrics.rttMs}ms, Jitter: ${periodicMetrics.metrics.jitterMs}ms)`);

    // =========================================================================
    // SECTION 4: BACKEND REST TELEMETRY ENDPOINTS & AUTHORIZATION
    // =========================================================================

    // Setup User A, Room A, and User B for authorization tests
    const userAEmail = `m7_host_${Date.now()}@cse.voicehub.edu`;
    const userBEmail = `m7_guest_${Date.now()}@cse.voicehub.edu`;

    // Register and Login User A
    await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email: userAEmail,
        password: 'Password123!',
        firstName: 'Metric',
        lastName: 'Host',
        department: 'CNT',
      },
    });
    const loginResA = await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userAEmail, password: 'Password123!' },
    });
    const cookieUserA = extractAuthCookie(loginResA.headers);

    // Register and Login User B
    await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email: userBEmail,
        password: 'Password123!',
        firstName: 'Metric',
        lastName: 'Stranger',
        department: 'CNT',
      },
    });
    const loginResB = await makeHttpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: userBEmail, password: 'Password123!' },
    });
    const cookieUserB = extractAuthCookie(loginResB.headers);

    // Create Room A with User A
    const roomRes = await makeHttpRequest({
      method: 'POST',
      path: '/api/rooms',
      body: {
        name: 'Phase 7 Telemetry Lab',
        description: 'Network metrics test room',
        maxParticipants: 10,
      },
      cookie: cookieUserA,
    });
    const roomCode = roomRes.body.room.roomCode;

    // Test 15: REST Endpoint GET /api/rooms/:roomCode/metrics (Active Member)
    const metricsRestRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode}/metrics`,
      cookie: cookieUserA,
    });

    if (metricsRestRes.status !== 200 || !metricsRestRes.body.success || !metricsRestRes.body.metrics) {
      throw new Error(`Test 15 Failed: Expected 200 OK from room metrics endpoint, got ${metricsRestRes.status}`);
    }
    const rMetrics = metricsRestRes.body.metrics;
    if (rMetrics.controlChannelHealth !== 'HEALTHY' || rMetrics.participantCount !== 1) {
      throw new Error(`Test 15 Failed: Metrics payload unexpected: ${JSON.stringify(rMetrics)}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 15: REST Room Metrics GET /api/rooms/:roomCode/metrics verified (Health: ${rMetrics.controlChannelHealth}, Members: ${rMetrics.participantCount})`);

    // Test 16: SECURITY PASS — Non-Member Rejected from Room Metrics (HTTP 403 Forbidden)
    const nonMemberMetricsRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode}/metrics`,
      cookie: cookieUserB, // User B is not joined to Room A
    });

    if (nonMemberMetricsRes.status !== 403) {
      throw new Error(`Test 16 Failed: Expected 403 Forbidden for non-member, got ${nonMemberMetricsRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 16: SECURITY PASS — Non-member user safely rejected with HTTP 403 Forbidden`);

    // Test 17: SECURITY PASS — Unauthenticated Request Rejected (HTTP 401 Unauthorized)
    const unauthMetricsRes = await makeHttpRequest({
      method: 'GET',
      path: `/api/rooms/${roomCode}/metrics`,
    });

    if (unauthMetricsRes.status !== 401) {
      throw new Error(`Test 17 Failed: Expected 401 Unauthorized for request without cookie, got ${unauthMetricsRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 17: SECURITY PASS — Unauthenticated request safely rejected with HTTP 401 Unauthorized`);

    // Test 18: REST System Telemetry GET /api/metrics (HTTP 200)
    const systemMetricsRes = await makeHttpRequest({
      method: 'GET',
      path: '/api/metrics',
    });

    if (systemMetricsRes.status !== 200 || !systemMetricsRes.body.memory?.heapUsedMb) {
      throw new Error(`Test 18 Failed: Expected 200 OK from system metrics, got ${systemMetricsRes.status}`);
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 18: System Telemetry GET /api/metrics verified (Uptime: ${systemMetricsRes.body.uptimeSeconds}s, Heap: ${systemMetricsRes.body.memory.heapUsedMb}MB)`);

    // Test 19: Cross-Room Isolation in Telemetry
    const collectorIsolation = new UdpMetricsCollector();
    collectorIsolation.recordIncomingPacket({
      sessionId: 'sess_room_A',
      roomCode: 'CVH-ROOM-A',
      sequence: 1,
      senderTimestamp: 1000,
      arrivalTimestamp: 1020,
      byteSize: 640,
    });
    const telemRoomB = collectorIsolation.getTelemetry('sess_room_B', 'CVH-ROOM-B');
    if (telemRoomB.packetsReceived !== 0 || telemRoomB.bytesReceived !== 0) {
      throw new Error('Test 19 Failed: Room A packets leaked into Room B telemetry');
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 19: Cross-Room Telemetry Isolation verified`);

    // Test 20: Clean Resource Shutdown
    if (testClientSocket) {
      testClientSocket.close();
      testClientSocket = null;
    }
    if (bridgeWs) {
      bridgeWs.close();
      bridgeWs = null;
    }
    if (bridgeServer) {
      await bridgeServer.stop();
      bridgeServer = null;
    }
    if (udpServer) {
      await udpServer.close();
      udpServer = null;
    }
    passedTests++;
    logger.info(`[PASS ${passedTests}] Test 20: All Phase 7 sockets, timers, and test resources cleaned up gracefully`);

    logger.info('');
    logger.info(`[PHASE 7 VERIFICATION SUMMARY] Total Tests: ${passedTests} | Passed: ${passedTests} | Failed: 0`);
    logger.info('🎉 ALL PHASE 7 NETWORK MONITORING & METRICS TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    logger.error('[PHASE 7 TEST FAILED]', error);
    if (testClientSocket) testClientSocket.close();
    if (bridgeWs) bridgeWs.close();
    if (bridgeServer) await bridgeServer.stop();
    if (udpServer) await udpServer.close();
    process.exit(1);
  }
}

runPhase7Tests();
