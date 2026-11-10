import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),

  // Database
  MONGODB_URI: z
    .string()
    .default('mongodb://localhost:27017/smc_showroom'),
  MONGODB_DB_NAME: z.string().default('smc'),

  // JWT
  JWT_SECRET: z.string().min(16).default('smc_development_jwt_secret_key_32chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Initial Admin Account
  ADMIN_NAME: z.string().default('SMC Admin'),
  ADMIN_EMAIL: z.string().email().default('javix@gmail.com'),
  ADMIN_PASSWORD: z.string().min(6).default('javix2026'),

  // Storage - MongoDB GridFS is the exclusive storage engine
  GRIDFS_BUCKET_NAME: z.string().default('models'),

  // Upload limits
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  MAX_IMAGE_SIZE_MB: z.coerce.number().default(10),
});

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
};

export const env = parseEnv();
export type Environment = z.infer<typeof envSchema>;
