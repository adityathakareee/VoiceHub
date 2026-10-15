import http from 'http';
import { logger } from '../utils/logger';

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
      path: url.pathname,
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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

const runPhase1Tests = async (): Promise<void> => {
  logger.info('[PHASE 1 TEST] Starting Phase 1 Comprehensive Security & API Verification...');

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
    const testEmail = `student_${Date.now()}@example.com`;
    const password = 'SecurePassword123!';

    // 1. Test Valid Registration
    const regRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        firstName: 'Test',
        lastName: 'Student',
        email: testEmail,
        password,
        department: 'Computer Engineering',
      },
    });

    assert(regRes.status === 201, 'Test 1: Public Registration succeeds with HTTP 201', `Got status ${regRes.status}`);
    assert(regRes.body.data?.user?.role === 'STUDENT', 'Test 1b: User role is STUDENT');
    assert(regRes.body.data?.user?.passwordHash === undefined, 'Test 1c: Password hash is excluded from register response');

    // 2. Test Role Escalation Prevention
    const escEmail = `escalation_${Date.now()}@example.com`;
    const escRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        firstName: 'Hacker',
        lastName: 'User',
        email: escEmail,
        password,
        role: 'ADMIN', // Client attempting role escalation
      },
    });

    assert(escRes.status === 201, 'Test 2: Registration with "role: ADMIN" processes');
    assert(
      escRes.body.data?.user?.role === 'STUDENT',
      'Test 2b: SECURITY PASS — Server strictly assigned role STUDENT and ignored client ADMIN role',
      `Got role: ${escRes.body.data?.user?.role}`
    );

    // 3. Test Duplicate Email Rejection
    const dupRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        firstName: 'Duplicate',
        lastName: 'User',
        email: testEmail,
        password,
      },
    });

    assert(dupRes.status === 409, 'Test 3: Duplicate email returns HTTP 409 Conflict', `Got status ${dupRes.status}`);

    // 4. Test Email Normalization Rejection
    const normEmail = testEmail.toUpperCase();
    const normRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        firstName: 'Normalized',
        lastName: 'User',
        email: normEmail,
        password,
      },
    });

    assert(normRes.status === 409, 'Test 4: Uppercase variant of email recognized as duplicate (HTTP 409)');

    // 5. Test Invalid Login Password
    const wrongPassRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: testEmail,
        password: 'WrongPassword999!',
      },
    });

    assert(wrongPassRes.status === 401, 'Test 5: Wrong password returns HTTP 401 Unauthorized');
    assert(
      wrongPassRes.body.message === 'Invalid email or password.',
      'Test 5b: Generic authentication failure message returned'
    );

    // 6. Test Valid Login
    const loginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: testEmail,
        password,
      },
    });

    assert(loginRes.status === 200, 'Test 6: Valid login returns HTTP 200 OK');

    const setCookieHeader = loginRes.headers['set-cookie'];
    assert(!!setCookieHeader && setCookieHeader.length > 0, 'Test 6b: Set-Cookie header present in login response');

    const rawCookie = setCookieHeader ? setCookieHeader[0] : '';
    assert(rawCookie.includes('HttpOnly'), 'Test 6c: Cookie has HttpOnly flag set');
    assert(rawCookie.includes('cse_voice_hub_auth'), 'Test 6d: Cookie uses configured name cse_voice_hub_auth');

    // Extract cookie for authenticated requests
    const authCookie = rawCookie.split(';')[0];

    // 7. Test GET /api/auth/me with Cookie
    const meRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
      cookie: authCookie,
    });

    assert(meRes.status === 200, 'Test 7: GET /api/auth/me returns HTTP 200 OK');
    assert(meRes.body.data?.user?.email === testEmail, 'Test 7b: Returns correct user profile data');
    assert(meRes.body.data?.user?.passwordHash === undefined, 'Test 7c: passwordHash is not exposed in /me');

    // 8. Test Tampered JWT Rejection
    const tamperedRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
      cookie: 'cse_voice_hub_auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidSignature',
    });

    assert(tamperedRes.status === 401, 'Test 8: SECURITY PASS — Tampered JWT rejected with HTTP 401');

    // 9. Test Unauthenticated Protected Route
    const unauthRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
    });

    assert(unauthRes.status === 401, 'Test 9: Request without cookie returns HTTP 401 Unauthorized');

    // 10. Test Profile Update
    const updateRes = await makeRequest({
      method: 'PATCH',
      path: '/api/users/me',
      cookie: authCookie,
      body: {
        firstName: 'AdityaUpdated',
        lastName: 'ThakareUpdated',
        department: 'Advanced Networking Lab',
        role: 'ADMIN', // Tampering attempt
      },
    });

    assert(updateRes.status === 200, 'Test 10: Profile update succeeds with HTTP 200 OK');
    assert(updateRes.body.data?.user?.firstName === 'AdityaUpdated', 'Test 10b: firstName updated');
    assert(
      updateRes.body.data?.user?.role === 'STUDENT',
      'Test 10c: SECURITY PASS — Role tampering ignored during profile update'
    );

    // 11. Test Role-Based Authorization
    const roleFailRes = await makeRequest({
      method: 'GET',
      path: '/api/users/admin-test',
      cookie: authCookie,
    });

    assert(roleFailRes.status === 403, 'Test 11: STUDENT access to ADMIN test route returns HTTP 403 Forbidden');

    // 12. Test Password Change & Session Invalidation
    const newPassword = 'NewSecurePassword456!';
    const passChangeRes = await makeRequest({
      method: 'PATCH',
      path: '/api/users/me/password',
      cookie: authCookie,
      body: {
        currentPassword: password,
        newPassword,
      },
    });

    assert(passChangeRes.status === 200, 'Test 12: Password change succeeds with HTTP 200 OK');

    // Verify token issued prior to password change is rejected
    const oldSessionRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
      cookie: authCookie,
    });

    assert(
      oldSessionRes.status === 401,
      'Test 12b: SECURITY PASS — Session token issued prior to password change is cryptographically rejected (HTTP 401)',
      `Got status ${oldSessionRes.status}`
    );

    // 13. Test Login with New Password
    const newLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: testEmail,
        password: newPassword,
      },
    });

    assert(newLoginRes.status === 200, 'Test 13: Login with new password succeeds (HTTP 200 OK)');
    const newAuthCookie = newLoginRes.headers['set-cookie']?.[0].split(';')[0];

    // 14. Test Logout & Cleared Cookie
    const logoutRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/logout',
      cookie: newAuthCookie,
    });

    assert(logoutRes.status === 200, 'Test 14: Logout returns HTTP 200 OK');
    const clearedCookieHeader = logoutRes.headers['set-cookie']?.[0];
    assert(
      !!clearedCookieHeader && (clearedCookieHeader.includes('Max-Age=0') || clearedCookieHeader.includes('Expires=Thu, 01 Jan 1970')),
      'Test 14b: Logout response sets Set-Cookie with Max-Age=0 / expired date'
    );

    // Request without cookie simulating cleared browser state after logout
    const afterLogoutRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
    });

    assert(afterLogoutRes.status === 401, 'Test 14c: /api/auth/me fails (HTTP 401) after logout');

    logger.info(`\n[PHASE 1 VERIFICATION SUMMARY] Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${testCount - passCount}`);

    if (passCount === testCount) {
      logger.info('🎉 ALL PHASE 1 SECURITY & FUNCTIONAL TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      logger.error('❌ SOME PHASE 1 TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    logger.error('Fatal error running Phase 1 test suite:', err);
    process.exit(1);
  }
};

runPhase1Tests();
