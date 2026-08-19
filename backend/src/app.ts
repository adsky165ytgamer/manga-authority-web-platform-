import Fastify, { type FastifyInstance } from "fastify";

type FastifyLikeError = Error & { statusCode?: number };
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { env } from "./config/env";
import { closePool, requirePool } from "./db/pool";
import {
  ApiError,
  authenticate,
  ok,
  parseUuid,
  requestIdHook,
  requireDevice,
  requireUser,
} from "./http/http";
import {
  createSchoolUser,
  createBranch,
  createClassroom,
  createNoticeType,
  createOrganization,
  diagnostics,
  getOrganization,
  grantUserScope,
  listBranches,
  listClassrooms,
  listDeliveryEvents,
  listDevices,
  listNoticeTypes,
  listOrganizations,
  listUsers,
  updateBranch,
  updateClassroom,
  updateOrganization,
  updateSchoolUser,
} from "./modules/admin";
import { login, logout, me, refresh } from "./modules/auth";
import { assignDevice, deviceConfig, heartbeat, registerDevice } from "./modules/devices";
import {
  acknowledge,
  createNotice,
  listNotices,
  retractNotice,
  syncForDevice,
  type NoticeInput,
} from "./modules/notices";
import "./http/types";

const uuid = z.string().uuid();
const noticeInput = z.object({
  typeId: uuid.nullish(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  priority: z.enum(["NORMAL", "HIGH", "EMERGENCY"]).default("NORMAL"),
  targetType: z.enum(["ORGANIZATION", "BRANCH", "CLASSROOM", "DEVICE"]),
  targetBranchId: uuid.nullish(),
  targetClassroomId: uuid.nullish(),
  targetDeviceId: uuid.nullish(),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

function body<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(400, "VALIDATION_ERROR", "Request body is invalid", parsed.error.flatten());
  return parsed.data;
}
function query<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Query parameters are invalid",
      parsed.error.flatten(),
    );
  return parsed.data;
}

const openApi = {
  openapi: "3.0.3",
  info: {
    title: "School Notice Platform API",
    version: "1.0.0",
    description: "Server-authoritative, multi-tenant school notice delivery API.",
  },
  servers: [{ url: "/api/v1" }],
  paths: Object.fromEntries(
    [
      ["auth/login", "POST"],
      ["auth/refresh", "POST"],
      ["auth/logout", "POST"],
      ["auth/me", "GET"],
      ["devices/register", "POST"],
      ["devices/me/config", "GET"],
      ["devices/heartbeat", "POST"],
      ["sync", "GET"],
      ["notices", "POST"],
      ["notices/{noticeId}/acknowledge", "POST"],
      ["notices/{noticeId}/retract", "POST"],
      ["admin/organizations", "GET,POST"],
      ["admin/branches", "GET,POST"],
      ["admin/classrooms", "GET,POST"],
      ["admin/devices", "GET"],
      ["admin/device-assignments", "POST"],
      ["admin/diagnostics", "GET"],
    ].map(([path, methods]) => [path, { summary: methods }]),
  ),
};

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, requestIdHeader: "x-request-id" });
  await app.register(cors, {
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", requestIdHook);
  app.setErrorHandler((error, request, reply) => {
    const apiError = error instanceof ApiError ? error : null;
    const statusCode = apiError?.statusCode ?? (error as FastifyLikeError).statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({
      error: {
        code: apiError?.code ?? "INTERNAL_ERROR",
        message: apiError?.message ?? "Internal server error",
        details: apiError?.details,
      },
      requestId: request.schoolContext.requestId,
    });
  });
  app.addHook("onClose", async () => {
    await closePool();
  });

  app.get("/health/live", async () => ({
    status: "ok",
    service: "school-notice-backend",
    time: Date.now(),
  }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await requirePool().query("select 1");
      return reply.send({ status: "ready", database: "ok", time: Date.now() });
    } catch {
      return reply
        .code(503)
        .send({ status: "not_ready", database: "unavailable", time: Date.now() });
    }
  });
  app.get("/docs/openapi.json", async (_request, reply) => reply.send(openApi));

  app.post("/api/v1/auth/login", async (request, reply) =>
    ok(
      reply,
      await login(
        body(z.object({ email: z.string().email(), password: z.string().min(8) }), request.body),
      ),
    ),
  );
  app.post("/api/v1/auth/refresh", async (request, reply) =>
    ok(
      reply,
      await refresh(
        body(z.object({ refreshToken: z.string().min(20) }), request.body).refreshToken,
      ),
    ),
  );
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const input = body(
      z.object({ refreshToken: z.string().min(20).optional() }),
      request.body ?? {},
    );
    await logout(input.refreshToken);
    return ok(reply, { success: true });
  });
  app.get("/api/v1/auth/me", async (request, reply) => {
    const principal = requireUser(request);
    return ok(reply, await me(principal.authUserId));
  });

  app.post("/api/v1/devices/register", async (request, reply) => {
    const input = body(
      z.object({
        deviceInstallationId: uuid,
        deviceType: z.string(),
        label: z.string().trim().min(1).max(200),
        organizationId: uuid.optional(),
        enrollmentSecret: z.string().optional(),
        manufacturer: z.string().max(200).optional(),
        model: z.string().max(200).optional(),
        androidVersion: z.string().max(80).optional(),
        appVersion: z.string().max(80).optional(),
        frameworkVersion: z.string().max(80).optional(),
        capabilities: z.array(z.string().max(100)).max(50).optional(),
      }),
      request.body,
    );
    return ok(reply, await registerDevice(input), 201);
  });
  app.get("/api/v1/devices/me/config", async (request, reply) =>
    ok(reply, await deviceConfig(requireDevice(request))),
  );
  app.post("/api/v1/devices/heartbeat", async (request, reply) =>
    ok(
      reply,
      await heartbeat(
        requireDevice(request),
        body(
          z.object({
            timestamp: z.number().optional(),
            networkType: z.string().max(40).optional(),
            batteryLevel: z.number().optional(),
            isCharging: z.boolean().optional(),
            appVersion: z.string().max(80).optional(),
            frameworkVersion: z.string().max(80).optional(),
          }),
          request.body,
        ),
      ),
    ),
  );

  app.get("/api/v1/notices", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
      "TEACHER",
      "STAFF",
      "VIEWER",
    ]);
    const input = query(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.string().datetime({ offset: true }).optional(),
      }),
      request.query,
    );
    return ok(reply, await listNotices(principal.organizationId, input));
  });
  app.post("/api/v1/notices", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
      "TEACHER",
      "STAFF",
    ]);
    return ok(
      reply,
      await createNotice(principal, body(noticeInput, request.body) as NoticeInput),
      201,
    );
  });
  app.post("/api/v1/notices/:noticeId/acknowledge", async (request, reply) => {
    const principal = requireDevice(request);
    const params = request.params as { noticeId: string };
    parseUuid(params.noticeId, "noticeId");
    return ok(
      reply,
      await acknowledge(
        principal.deviceId,
        params.noticeId,
        body(z.object({ acknowledgedAt: z.number().optional() }), request.body ?? {})
          .acknowledgedAt,
      ),
    );
  });
  app.post("/api/v1/notices/:noticeId/retract", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
    ]);
    const params = request.params as { noticeId: string };
    parseUuid(params.noticeId, "noticeId");
    return ok(reply, await retractNotice(principal, params.noticeId));
  });
  app.get("/api/v1/sync", async (request, reply) => {
    const principal = requireDevice(request);
    const input = query(
      z.object({
        after: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      request.query,
    );
    return ok(reply, await syncForDevice(principal.deviceId, input.after, input.limit));
  });

  app.get("/api/v1/admin/organizations", async (request, reply) => {
    requireUser(request, ["SUPER_ADMIN"]);
    return ok(reply, await listOrganizations());
  });
  app.post("/api/v1/admin/organizations", async (request, reply) => {
    requireUser(request, ["SUPER_ADMIN"]);
    return ok(
      reply,
      await createOrganization(
        body(
          z.object({
            name: z.string().trim().min(1).max(200),
            code: z.string().trim().min(1).max(80),
            enabled: z.boolean().optional(),
          }),
          request.body,
        ),
      ),
      201,
    );
  });
  app.get("/api/v1/admin/organizations/:id", async (request, reply) => {
    const principal = requireUser(request);
    const id = parseUuid((request.params as { id: string }).id, "id");
    return ok(reply, await getOrganization(id, principal));
  });
  app.patch("/api/v1/admin/organizations/:id", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const id = parseUuid((request.params as { id: string }).id, "id");
    return ok(
      reply,
      await updateOrganization(
        id,
        body(
          z.object({
            name: z.string().trim().min(1).max(200).optional(),
            code: z.string().trim().min(1).max(80).optional(),
            enabled: z.boolean().optional(),
          }),
          request.body,
        ),
        principal,
      ),
    );
  });

  app.get("/api/v1/admin/branches", async (request, reply) => {
    const principal = requireUser(request);
    const input = query(z.object({ organizationId: uuid.optional() }), request.query);
    const organizationId = input.organizationId ?? principal.organizationId;
    return ok(reply, await listBranches(organizationId, principal));
  });
  app.post("/api/v1/admin/branches", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const input = body(
      z.object({
        organizationId: uuid,
        name: z.string().trim().min(1).max(200),
        code: z.string().trim().min(1).max(80),
        enabled: z.boolean().optional(),
      }),
      request.body,
    );
    return ok(reply, await createBranch(input.organizationId, input, principal), 201);
  });
  app.patch("/api/v1/admin/branches/:id", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const id = parseUuid((request.params as { id: string }).id, "id");
    return ok(
      reply,
      await updateBranch(
        id,
        body(
          z.object({
            name: z.string().trim().min(1).max(200).optional(),
            code: z.string().trim().min(1).max(80).optional(),
            enabled: z.boolean().optional(),
          }),
          request.body,
        ),
        principal,
      ),
    );
  });

  app.get("/api/v1/admin/classrooms", async (request, reply) => {
    const principal = requireUser(request);
    const input = query(
      z.object({ organizationId: uuid.optional(), branchId: uuid.optional() }),
      request.query,
    );
    return ok(
      reply,
      await listClassrooms(
        input.organizationId ?? principal.organizationId,
        input.branchId,
        principal,
      ),
    );
  });
  app.post("/api/v1/admin/classrooms", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "BRANCH_ADMIN"]);
    const input = body(
      z.object({
        organizationId: uuid,
        branchId: uuid,
        name: z.string().trim().min(1).max(200),
        code: z.string().trim().min(1).max(80),
        grade: z.string().max(80).optional(),
        section: z.string().max(80).optional(),
        enabled: z.boolean().optional(),
      }),
      request.body,
    );
    return ok(reply, await createClassroom(input.organizationId, input, principal), 201);
  });
  app.patch("/api/v1/admin/classrooms/:id", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "BRANCH_ADMIN"]);
    const id = parseUuid((request.params as { id: string }).id, "id");
    return ok(
      reply,
      await updateClassroom(
        id,
        body(
          z.object({
            name: z.string().trim().min(1).max(200).optional(),
            code: z.string().trim().min(1).max(80).optional(),
            grade: z.string().max(80).nullable().optional(),
            section: z.string().max(80).nullable().optional(),
            enabled: z.boolean().optional(),
          }),
          request.body,
        ),
        principal,
      ),
    );
  });

  app.get("/api/v1/admin/users", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const input = query(z.object({ organizationId: uuid.optional() }), request.query);
    return ok(reply, await listUsers(input.organizationId ?? principal.organizationId, principal));
  });
  app.post("/api/v1/admin/users", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const input = body(
      z.object({
        organizationId: uuid,
        authUserId: uuid,
        name: z.string().trim().min(1).max(200),
        email: z.string().email().nullish(),
        phone: z.string().max(40).nullish(),
        role: z.enum([
          "SUPER_ADMIN",
          "ORGANIZATION_ADMIN",
          "BRANCH_ADMIN",
          "PRINCIPAL",
          "TEACHER",
          "STAFF",
          "VIEWER",
        ]),
      }),
      request.body,
    );
    return ok(reply, await createSchoolUser(input.organizationId, input, principal), 201);
  });
  app.patch("/api/v1/admin/users/:id", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const id = parseUuid((request.params as { id: string }).id, "id");
    return ok(
      reply,
      await updateSchoolUser(
        id,
        body(
          z.object({
            name: z.string().trim().min(1).max(200).optional(),
            email: z.string().email().nullable().optional(),
            phone: z.string().max(40).nullable().optional(),
            role: z
              .enum([
                "SUPER_ADMIN",
                "ORGANIZATION_ADMIN",
                "BRANCH_ADMIN",
                "PRINCIPAL",
                "TEACHER",
                "STAFF",
                "VIEWER",
              ])
              .optional(),
            enabled: z.boolean().optional(),
          }),
          request.body,
        ),
        principal,
      ),
    );
  });
  app.post("/api/v1/admin/user-scopes", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const input = body(
      z.object({
        userId: uuid,
        organizationId: uuid,
        branchId: uuid.nullish(),
        classroomId: uuid.nullish(),
        canSend: z.boolean().optional(),
        canManage: z.boolean().optional(),
      }),
      request.body,
    );
    return ok(reply, await grantUserScope(input, principal), 201);
  });

  app.get("/api/v1/admin/devices", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
    ]);
    const input = query(z.object({ organizationId: uuid.optional() }), request.query);
    return ok(
      reply,
      await listDevices(input.organizationId ?? principal.organizationId, principal),
    );
  });
  app.post("/api/v1/admin/device-assignments", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
    ]);
    const input = body(
      z.object({
        deviceId: uuid,
        organizationId: uuid,
        branchId: uuid.nullish(),
        classroomId: uuid.nullish(),
        role: z.enum(["RECEIVER", "SENDER", "ADMIN"]),
      }),
      request.body,
    );
    if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== input.organizationId)
      throw new ApiError(404, "NOT_FOUND", "Resource not found");
    return ok(reply, await assignDevice(input), 201);
  });

  app.get("/api/v1/admin/notice-types", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
      "TEACHER",
      "STAFF",
    ]);
    const input = query(z.object({ organizationId: uuid.optional() }), request.query);
    return ok(
      reply,
      await listNoticeTypes(input.organizationId ?? principal.organizationId, principal),
    );
  });
  app.post("/api/v1/admin/notice-types", async (request, reply) => {
    const principal = requireUser(request, ["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
    const input = body(
      z.object({
        organizationId: uuid,
        name: z.string().trim().min(1).max(120),
        code: z.string().trim().min(1).max(80),
        description: z.string().nullish(),
      }),
      request.body,
    );
    return ok(reply, await createNoticeType(input.organizationId, input, principal), 201);
  });
  app.get("/api/v1/admin/diagnostics", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
    ]);
    const input = query(z.object({ organizationId: uuid.optional() }), request.query);
    return ok(
      reply,
      await diagnostics(input.organizationId ?? principal.organizationId, principal),
    );
  });
  app.get("/api/v1/admin/delivery-events", async (request, reply) => {
    const principal = requireUser(request, [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "BRANCH_ADMIN",
      "PRINCIPAL",
    ]);
    const input = query(
      z.object({ organizationId: uuid.optional(), noticeId: uuid.optional() }),
      request.query,
    );
    return ok(
      reply,
      await listDeliveryEvents(
        input.organizationId ?? principal.organizationId,
        input.noticeId,
        principal,
      ),
    );
  });

  await app.ready();
  return app;
}
