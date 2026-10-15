import jwt, { JwtPayload } from 'jsonwebtoken';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export interface VerifiedUdpTokenPayload extends JwtPayload {
  userId: string;
  roomCode: string;
  role: string;
}

/**
 * Verifies a short-lived UDP session authorization token issued by the Express backend.
 * Uses the shared UDP_SESSION_SECRET.
 */
export const verifyUdpToken = (token: string): VerifiedUdpTokenPayload => {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing or empty UDP session token');
  }

  try {
    const decoded = jwt.verify(token, envConfig.UDP_SESSION_SECRET) as VerifiedUdpTokenPayload;

    if (!decoded.userId || !decoded.roomCode || !decoded.role) {
      throw new Error('Token payload missing required claims (userId, roomCode, role)');
    }

    return decoded;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token signature';
    logger.warn(`UDP session token verification failed: ${message}`);
    throw new Error(`UDP Token Validation Error: ${message}`);
  }
};

/**
 * Signs a short-lived UDP session authorization token.
 */
export const signUdpSessionToken = (payload: { userId: string; roomCode: string; role: string }): string => {
  return jwt.sign(payload, envConfig.UDP_SESSION_SECRET, {
    expiresIn: '5m',
  });
};

