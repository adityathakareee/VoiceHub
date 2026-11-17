import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Load .env file explicitly for backend
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default('5000'),
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine((val) => val.startsWith('mongodb://') || val.startsWith('mongodb+srv://'), {
      message: 'MONGODB_URI must be a valid MongoDB URI starting with mongodb:// or mongodb+srv://',
    })
    .default('mongodb://localhost:27017/cse_voice_hub'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5174'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('cse_voice_hub_jwt_super_secret_key_2026'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  COOKIE_NAME: z.string().default('cse_voice_hub_auth'),
  UDP_SESSION_SECRET: z.string().default('cse_voice_hub_udp_session_super_secret_key_2026'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let validatedEnv: EnvConfig;

try {
  validatedEnv = envSchema.parse(process.env);
  logger.info(`Backend Environment validated successfully [NODE_ENV=${validatedEnv.NODE_ENV}]`);
} catch (error) {
  if (error instanceof z.ZodError) {
    logger.error('Invalid environment variables configuration:');
    error.errors.forEach((err) => {
      logger.error(` - Variable: ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    logger.error('Failed to parse environment variables', error);
  }
  process.exit(1);
}

export const envConfig = validatedEnv;
