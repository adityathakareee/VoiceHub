import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { User, UserRole } from '../models/user.model';
import { hashPassword, validatePasswordPolicy } from '../utils/password';
import { logger } from '../utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const seedAdmin = async (): Promise<void> => {
  logger.info('[SEED ADMIN] Starting development admin seed process...');

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    logger.error(
      '[SEED ADMIN] FAILED: Missing required environment variables: ADMIN_EMAIL and ADMIN_PASSWORD must be defined to run seed script.'
    );
    process.exit(1);
  }

  const policyResult = validatePasswordPolicy(adminPassword);
  if (!policyResult.isValid) {
    logger.error(`[SEED ADMIN] FAILED: Provided ADMIN_PASSWORD does not meet password policy: ${policyResult.message}`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cse_voice_hub';

  try {
    await mongoose.connect(mongoUri);
    logger.info('[SEED ADMIN] Connected to MongoDB for admin seeding.');

    const passwordHash = await hashPassword(adminPassword);

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      existingAdmin.passwordHash = passwordHash;
      existingAdmin.role = UserRole.ADMIN;
      existingAdmin.isActive = true;
      await existingAdmin.save();
      logger.info(`[SEED ADMIN] SUCCESS: Existing admin account updated for ${adminEmail} [Role=ADMIN]`);
    } else {
      const newAdmin = new User({
        firstName: 'System',
        lastName: 'Administrator',
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        department: 'Computer Engineering Department',
        isActive: true,
      });
      await newAdmin.save();
      logger.info(`[SEED ADMIN] SUCCESS: New admin account created for ${adminEmail} [Role=ADMIN]`);
    }

    await mongoose.disconnect();
    logger.info('[SEED ADMIN] MongoDB connection closed cleanly. Seed process complete.');
    process.exit(0);
  } catch (error) {
    logger.error('[SEED ADMIN] Error seeding admin account:', error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
};

seedAdmin();
