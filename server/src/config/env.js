import 'dotenv/config';

/**
 * Every environment variable the server reads, in one place, validated at boot.
 * A missing required variable fails here rather than at the first request.
 */
const required = ['MONGODB_URI'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};

export const isProduction = config.nodeEnv === 'production';
