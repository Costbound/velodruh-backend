import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/velodruh'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000,https://velodruh.ua'),
  CATALOG_SOURCE: z.enum(['memory', 'postgres']).default('memory'),
  REEFAPI_BASE_URL: z.string().url().default('https://api.reefapi.com'),
  REEFAPI_API_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(rawEnv);
}

export const env = loadEnv();
