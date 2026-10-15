import { CookieOptions } from 'express';
import { User, IUser, UserRole } from '../models/user.model';
import { RegisterDTO, LoginDTO } from '../schemas/auth.schema';
import { hashPassword, comparePassword, validatePasswordPolicy } from '../utils/password';
import { signToken } from '../utils/jwt';
import { envConfig } from '../config/env.config';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export interface SafeUserResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  department: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const formatSafeUser = (user: IUser): SafeUserResponse => ({
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  department: user.department,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const getAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: envConfig.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes matching JWT expiration
  path: '/',
});

export class AuthService {
  public static async register(data: RegisterDTO): Promise<SafeUserResponse> {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Password policy check
    const policyResult = validatePasswordPolicy(data.password);
    if (!policyResult.isValid) {
      throw new AppError(policyResult.message || 'Password does not meet security requirements.', 400);
    }

    // 2. Check email uniqueness
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError('An account with this email address already exists.', 409);
    }

    // 3. Hash password securely
    const passwordHash = await hashPassword(data.password);

    // 4. Force role to STUDENT for public registration (role escalation defense)
    const newUser = new User({
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: UserRole.STUDENT, // Strictly forced to STUDENT
      department: data.department.trim(),
      isActive: true,
    });

    try {
      await newUser.save();
      logger.info(`New user registered successfully [ID=${newUser._id}, Role=${newUser.role}]`);
      return formatSafeUser(newUser);
    } catch (error: any) {
      if (error.code === 11000) {
        throw new AppError('An account with this email address already exists.', 409);
      }
      throw error;
    }
  }

  public static async login(data: LoginDTO): Promise<{ user: SafeUserResponse; token: string }> {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Find user including hidden passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      // Generic authentication failure message to prevent account enumeration
      throw new AppError('Invalid email or password.', 401);
    }

    // 2. Verify account is active
    if (!user.isActive) {
      throw new AppError('This user account has been deactivated. Please contact support.', 401);
    }

    // 3. Verify password hash
    const isPasswordValid = await comparePassword(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    // 4. Generate JWT token
    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      passwordChangedAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : undefined,
    });

    logger.info(`User logged in successfully [ID=${user._id}, Role=${user.role}]`);

    return {
      user: formatSafeUser(user),
      token,
    };
  }
}
