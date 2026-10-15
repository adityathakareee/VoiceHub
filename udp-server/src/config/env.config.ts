import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  UDP_HOST: z.string().default('0.0.0.0'),
  UDP_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default('5001'),
  UDP_HEARTBEAT_INTERVAL_MS: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default('5000'),
  UDP_CLIENT_TIMEOUT_MS: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default('15000'),
  UDP_MAX_PACKET_SIZE: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default('1200'),
  UDP_SESSION_SECRET: z.string().default('cse_voice_hub_udp_session_super_secret_key_2026'),
});

export type UdpEnvConfig = z.infer<typeof envSchema>;

let validatedEnv: UdpEnvConfig;

try {
  validatedEnv = envSchema.parse(process.env);
  logger.info(`UDP Server Environment validated successfully [PORT=${validatedEnv.UDP_PORT}]`);
} catch (error) {
  if (error instanceof z.ZodError) {
    logger.error('Invalid UDP server environment variables:');
    error.errors.forEach((err) => {
      logger.error(` - Variable: ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    logger.error('Failed to parse UDP environment variables', error);
  }
  process.exit(1);
}

export const envConfig = validatedEnv;
