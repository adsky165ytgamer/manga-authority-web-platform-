import crypto from "node:crypto";
import { env } from "../config/env";
import type { AssignmentRole, DeviceType, Role } from "../http/types";

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string): string {
  return crypto
    .createHmac("sha256", env.jwtSecret ?? "development-only-secret")
    .update(input)
    .digest("base64url");
}

export type AccessClaims =
  | {
      typ: "user";
      sub: string;
      authUserId: string;
      organizationId: string;
      role: Role;
      iat: number;
      exp: number;
    }
  | {
      typ: "device";
      sub: string;
      organizationId: string;
      deviceType: DeviceType;
      assignmentRole: AssignmentRole | null;
      iat: number;
      exp: number;
    };
export type AccessTokenInput =
  | { typ: "user"; sub: string; authUserId: string; organizationId: string; role: Role }
  | {
      typ: "device";
      sub: string;
      organizationId: string;
      deviceType: DeviceType;
      assignmentRole: AssignmentRole | null;
    };

export function createAccessToken(claims: AccessTokenInput): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ ...claims, iat: now, exp: now + env.accessTokenTtlSeconds }),
  );
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessClaims;
    if (!data.sub || !data.typ || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function createOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
