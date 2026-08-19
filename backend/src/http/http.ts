import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../security/tokens";
import type { Principal, Role } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function ok(reply: FastifyReply, data: unknown, statusCode = 200) {
  return reply.code(statusCode).send({ data, requestId: reply.request.schoolContext.requestId });
}

export async function requestIdHook(request: FastifyRequest): Promise<void> {
  request.schoolContext = {
    requestId: request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
  };
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

export function authenticate(request: FastifyRequest): Principal {
  const token = bearerToken(request);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) throw new ApiError(401, "UNAUTHENTICATED", "A valid bearer token is required");
  const principal: Principal =
    claims.typ === "user"
      ? {
          kind: "user",
          userId: claims.sub,
          authUserId: claims.authUserId,
          organizationId: claims.organizationId,
          role: claims.role,
        }
      : {
          kind: "device",
          deviceId: claims.sub,
          organizationId: claims.organizationId,
          deviceType: claims.deviceType,
          assignmentRole: claims.assignmentRole,
        };
  request.schoolContext.principal = principal;
  return principal;
}

export function requireUser(
  request: FastifyRequest,
  roles?: Role[],
): Extract<Principal, { kind: "user" }> {
  const principal = request.schoolContext.principal ?? authenticate(request);
  if (principal.kind !== "user")
    throw new ApiError(403, "USER_AUTH_REQUIRED", "This operation requires a user session");
  if (roles && !roles.includes(principal.role))
    throw new ApiError(403, "FORBIDDEN", "Your role cannot perform this operation");
  return principal;
}

export function requireDevice(request: FastifyRequest): Extract<Principal, { kind: "device" }> {
  const principal = request.schoolContext.principal ?? authenticate(request);
  if (principal.kind !== "device")
    throw new ApiError(
      403,
      "DEVICE_AUTH_REQUIRED",
      "This operation requires a receiver device session",
    );
  return principal;
}

export function requireSameOrganization(principal: Principal, organizationId: string): void {
  if (principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
}

export function parseUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new ApiError(400, "INVALID_UUID", `${field} must be a UUID`);
  }
  return value;
}
