import jwt, { JwtPayload } from 'jsonwebtoken';
import { envConfig } from '../config/env.config';

export interface UserJwtPayload extends JwtPayload {
  userId: string;
  role: string;
  passwordChangedAt?: number;
}

export interface UdpSessionJwtPayload extends JwtPayload {
  userId: string;
  roomCode: string;
  role: string;
}

export const signToken = (payload: { userId: string; role: string; passwordChangedAt?: number }): string => {
  return jwt.sign(payload, envConfig.JWT_SECRET, {
    expiresIn: envConfig.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): UserJwtPayload => {
  const decoded = jwt.verify(token, envConfig.JWT_SECRET) as UserJwtPayload;
  if (!decoded.userId || !decoded.role) {
    throw new Error('Invalid token payload structure');
  }
  return decoded;
};

export const signUdpSessionToken = (payload: { userId: string; roomCode: string; role: string }): string => {
  return jwt.sign(payload, envConfig.UDP_SESSION_SECRET, {
    expiresIn: '5m', // Short-lived 5-minute session credential
  });
};

export const verifyUdpSessionToken = (token: string): UdpSessionJwtPayload => {
  const decoded = jwt.verify(token, envConfig.UDP_SESSION_SECRET) as UdpSessionJwtPayload;
  if (!decoded.userId || !decoded.roomCode || !decoded.role) {
    throw new Error('Invalid UDP session token payload structure');
  }
  return decoded;
};

