import { z } from 'zod'

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = z.object({
    GOOGLE_CLOUD_PROJECT: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:5199,http://localhost:5199,capacitor://localhost'),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    MEDIA_BUCKET: z.string().min(1).optional(),
  }).parse(env)
  if ((env.NODE_ENV === 'production' || env.K_SERVICE) && config.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('The authentication emulator must never be enabled in production')
  }
  if (config.FIREBASE_AUTH_EMULATOR_HOST && !config.GOOGLE_CLOUD_PROJECT.startsWith('demo-')) {
    throw new Error('Local authentication must use an isolated demo- project ID')
  }
  return { ...config, origins: config.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) }
}
