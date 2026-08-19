import 'dotenv/config';

/**
 * Every environment variable the server reads, in one place, validated at boot.
 * A missing required variable fails here rather than at the first request.
 */
const required = ['MONGODB_URI', 'OPERATING_TIMEZONE'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // The single business timezone every Assignment.date is expressed in. Required rather than
  // defaulted: a date derived from the server's system clock breaks the first time the app is
  // deployed to a machine in another region, and the symptom is slots on the wrong day.
  operatingTimezone: process.env.OPERATING_TIMEZONE,
};

export const isProduction = config.nodeEnv === 'production';
