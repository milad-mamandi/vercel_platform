import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  CONNECTION_REVALIDATION_SCHEDULE_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  CONNECTION_STALE_AFTER_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000)
});

export const env = schema.parse(process.env);
