import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { requirePool, withTransaction } from "../db/pool";
import { ApiError } from "../http/http";
import type { Role } from "../http/types";
import { createAccessToken, createOpaqueToken, sha256 } from "../security/tokens";

const supabaseAuth =
  env.supabaseUrl && env.supabasePublishableKey
    ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const roleValues: Role[] = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "BRANCH_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "STAFF",
  "VIEWER",
];

function role(value: unknown): Role {
  if (typeof value === "string" && roleValues.includes(value as Role)) return value as Role;
  return "VIEWER";
}

async function findSchoolUser(authUserId: string) {
  const db = requirePool();
  const result = await db.query(
    `select u.id, u.auth_user_id, u.organization_id, u.role, u.enabled, u.name, u.email, o.enabled as organization_enabled
     from public.school_users u join public.school_organizations o on o.id = u.organization_id
     where u.auth_user_id = $1 limit 1`,
    [authUserId],
  );
  return result.rows[0] as
    | {
        id: string;
        auth_user_id: string;
        organization_id: string;
        role: string;
        enabled: boolean;
        name: string;
        email: string | null;
        organization_enabled: boolean;
      }
    | undefined;
}

function issueUserTokens(user: {
  id: string;
  auth_user_id: string;
  organization_id: string;
  role: string;
}) {
  const accessToken = createAccessToken({
    typ: "user",
    sub: user.id,
    authUserId: user.auth_user_id,
    organizationId: user.organization_id,
    role: role(user.role),
  });
  const refreshToken = createOpaqueToken();
  return { accessToken, refreshToken };
}

export async function login(input: { email: string; password: string }) {
  if (!supabaseAuth)
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Supabase authentication is not configured");
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error || !data.user)
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  const user = await findSchoolUser(data.user.id);
  if (!user || !user.enabled || !user.organization_enabled)
    throw new ApiError(
      403,
      "ACCOUNT_DISABLED",
      "This account is not enabled for the school platform",
    );
  const tokens = issueUserTokens(user);
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlSeconds * 1000);
  await withTransaction(async (client) => {
    await client.query(
      `update public.school_refresh_sessions set revoked_at = now() where auth_user_id = $1 and revoked_at is null`,
      [data.user.id],
    );
    await client.query(
      `insert into public.school_refresh_sessions (auth_user_id, organization_id, refresh_token_hash, expires_at) values ($1,$2,$3,$4)`,
      [data.user.id, user.organization_id, sha256(tokens.refreshToken), expiresAt],
    );
    await client.query(`update public.school_users set last_login_at = now() where id = $1`, [
      user.id,
    ]);
  });
  return {
    ...tokens,
    expiresIn: env.accessTokenTtlSeconds,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: role(user.role),
      organizationId: user.organization_id,
    },
  };
}

export async function refresh(refreshToken: string) {
  const db = requirePool();
  const found = await db.query(
    `select s.id, s.auth_user_id, s.organization_id, u.id as user_id, u.role, u.enabled, o.enabled as organization_enabled
     from public.school_refresh_sessions s
     join public.school_users u on u.auth_user_id = s.auth_user_id
     join public.school_organizations o on o.id = s.organization_id
     where s.refresh_token_hash = $1 and s.revoked_at is null and s.expires_at > now() limit 1`,
    [sha256(refreshToken)],
  );
  const row = found.rows[0] as
    | {
        id: string;
        auth_user_id: string;
        organization_id: string;
        user_id: string;
        role: string;
        enabled: boolean;
        organization_enabled: boolean;
      }
    | undefined;
  if (!row || !row.enabled || !row.organization_enabled)
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  const next = issueUserTokens({
    id: row.user_id,
    auth_user_id: row.auth_user_id,
    organization_id: row.organization_id,
    role: row.role,
  });
  await withTransaction(async (client) => {
    await client.query(
      `update public.school_refresh_sessions set revoked_at = now(), last_used_at = now() where id = $1`,
      [row.id],
    );
    await client.query(
      `insert into public.school_refresh_sessions (auth_user_id, organization_id, refresh_token_hash, expires_at) values ($1,$2,$3,$4)`,
      [
        row.auth_user_id,
        row.organization_id,
        sha256(next.refreshToken),
        new Date(Date.now() + env.refreshTokenTtlSeconds * 1000),
      ],
    );
  });
  return { ...next, expiresIn: env.accessTokenTtlSeconds };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const db = requirePool();
  await db.query(
    `update public.school_refresh_sessions set revoked_at = now(), last_used_at = now() where refresh_token_hash = $1 and revoked_at is null`,
    [sha256(refreshToken)],
  );
}

export async function me(authUserId: string) {
  const user = await findSchoolUser(authUserId);
  if (!user || !user.enabled || !user.organization_enabled)
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account is not enabled");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: role(user.role),
    organizationId: user.organization_id,
  };
}
