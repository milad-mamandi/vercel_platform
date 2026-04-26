import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
});

export const env = schema.parse(process.env);
