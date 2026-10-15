import cors, { CorsOptions } from 'cors';
import { envConfig } from '../config/env.config';

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === envConfig.FRONTEND_URL || envConfig.NODE_ENV === 'development') {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy restricts access from origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

export const corsMiddleware = cors(corsOptions);
