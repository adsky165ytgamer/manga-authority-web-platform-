function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.BACKEND_HOST ?? "0.0.0.0",
  port: Number(process.env.BACKEND_PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: process.env.SCHOOL_JWT_SECRET,
  deviceEnrollmentSecret: process.env.DEVICE_ENROLLMENT_SECRET,
  corsOrigin: process.env.BACKEND_CORS_ORIGIN ?? "*",
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 2592000),
  heartbeatRecentSeconds: Number(process.env.HEARTBEAT_RECENT_SECONDS ?? 300),
  heartbeatOnlineSeconds: Number(process.env.HEARTBEAT_ONLINE_SECONDS ?? 90),
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
} as const;

export function assertProductionConfig(): void {
  if (!env.databaseUrl) required("DATABASE_URL");
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new Error("SCHOOL_JWT_SECRET must be at least 32 characters");
  }
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");
  }
  if (env.isProduction && !env.deviceEnrollmentSecret) {
    throw new Error("DEVICE_ENROLLMENT_SECRET is required in production");
  }
}
