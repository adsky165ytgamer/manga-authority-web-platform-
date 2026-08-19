import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env";
import { requirePool, withTransaction } from "../db/pool";
import { ApiError, requireSameOrganization } from "../http/http";
import type { DeviceType, Principal } from "../http/types";
import { createAccessToken, createOpaqueToken, sha256 } from "../security/tokens";

const deviceTypes: DeviceType[] = [
  "RECEIVER_PHONE",
  "RECEIVER_TV",
  "RECEIVER_PANEL",
  "SENDER_PHONE",
  "ADMIN_DEVICE",
];

function assertDeviceType(value: string): asserts value is DeviceType {
  if (!deviceTypes.includes(value as DeviceType))
    throw new ApiError(400, "INVALID_DEVICE_TYPE", "Unsupported device type");
}

async function currentAssignment(deviceId: string) {
  const db = requirePool();
  const result = await db.query(
    `select a.id, a.organization_id, a.branch_id, a.classroom_id, a.role, a.effective_from, a.effective_until,
            b.name as branch_name, b.code as branch_code, c.name as classroom_name, c.code as classroom_code
     from public.school_device_assignments a
     left join public.school_branches b on b.id = a.branch_id
     left join public.school_classrooms c on c.id = a.classroom_id
     where a.device_id = $1 and a.effective_until is null order by a.effective_from desc limit 1`,
    [deviceId],
  );
  return result.rows[0] ?? null;
}

async function issueDeviceToken(
  deviceId: string,
  organizationId: string,
  deviceType: DeviceType,
  assignmentRole: string | null,
) {
  const token = createOpaqueToken();
  const db = requirePool();
  await withTransaction(async (client) => {
    await client.query(
      `update public.school_device_tokens set revoked_at = now() where device_id = $1 and revoked_at is null`,
      [deviceId],
    );
    await client.query(
      `insert into public.school_device_tokens (device_id, token_hash) values ($1,$2)`,
      [deviceId, sha256(token)],
    );
  });
  return {
    token,
    accessToken: createAccessToken({
      typ: "device",
      sub: deviceId,
      organizationId,
      deviceType,
      assignmentRole: assignmentRole as "RECEIVER" | "SENDER" | "ADMIN" | null,
    }),
  };
}

export async function authenticateDeviceToken(token: string) {
  const db = requirePool();
  const result = await db.query(
    `select d.id, d.organization_id, d.device_type, d.enabled, o.enabled as organization_enabled,
            a.role as assignment_role
     from public.school_device_tokens t
     join public.school_devices d on d.id = t.device_id
     join public.school_organizations o on o.id = d.organization_id
     left join public.school_device_assignments a on a.device_id = d.id and a.effective_until is null
     where t.token_hash = $1 and t.revoked_at is null limit 1`,
    [sha256(token)],
  );
  const row = result.rows[0] as
    | {
        id: string;
        organization_id: string;
        device_type: DeviceType;
        enabled: boolean;
        organization_enabled: boolean;
        assignment_role: string | null;
      }
    | undefined;
  if (!row || !row.enabled || !row.organization_enabled) return null;
  await db.query(
    `update public.school_device_tokens set last_used_at = now() where token_hash = $1`,
    [sha256(token)],
  );
  return row;
}

export async function registerDevice(input: {
  deviceInstallationId: string;
  deviceType: string;
  label: string;
  organizationId?: string;
  enrollmentSecret?: string;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  appVersion?: string;
  frameworkVersion?: string;
  capabilities?: string[];
}) {
  assertDeviceType(input.deviceType);
  const db = requirePool();
  const existing = await db.query(
    `select id, organization_id, device_type from public.school_devices where device_installation_id = $1 limit 1`,
    [input.deviceInstallationId],
  );
  let device = existing.rows[0] as
    { id: string; organization_id: string; device_type: DeviceType } | undefined;
  if (!device) {
    if (!input.organizationId)
      throw new ApiError(
        400,
        "ORGANIZATION_REQUIRED",
        "organizationId is required for first enrollment",
      );
    if (env.isProduction && input.enrollmentSecret !== env.deviceEnrollmentSecret)
      throw new ApiError(401, "INVALID_ENROLLMENT", "Device enrollment secret is invalid");
    if (
      !env.isProduction &&
      env.deviceEnrollmentSecret &&
      input.enrollmentSecret !== env.deviceEnrollmentSecret
    )
      throw new ApiError(401, "INVALID_ENROLLMENT", "Device enrollment secret is invalid");
    const created = await db.query(
      `insert into public.school_devices (organization_id, device_installation_id, device_type, label, manufacturer, model, android_version, app_version, framework_version, last_seen_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning id, organization_id, device_type`,
      [
        input.organizationId,
        input.deviceInstallationId,
        input.deviceType,
        input.label,
        input.manufacturer ?? null,
        input.model ?? null,
        input.androidVersion ?? null,
        input.appVersion ?? null,
        input.frameworkVersion ?? null,
      ],
    );
    device = created.rows[0] as typeof device;
  } else {
    if (input.organizationId && input.organizationId !== device.organization_id)
      throw new ApiError(
        409,
        "INSTALLATION_ORGANIZATION_MISMATCH",
        "Installation is already enrolled in another organization",
      );
    await db.query(
      `update public.school_devices set label=$2, manufacturer=$3, model=$4, android_version=$5, app_version=$6, framework_version=$7, last_seen_at=now() where id=$1`,
      [
        device.id,
        input.label,
        input.manufacturer ?? null,
        input.model ?? null,
        input.androidVersion ?? null,
        input.appVersion ?? null,
        input.frameworkVersion ?? null,
      ],
    );
  }
  if (!device) throw new ApiError(500, "DEVICE_CREATE_FAILED", "Device registration failed");
  for (const capability of new Set(input.capabilities ?? [])) {
    await db.query(
      `insert into public.school_device_capabilities (device_id, capability, enabled) values ($1,$2,true) on conflict (device_id, capability) do update set enabled=true`,
      [device.id, capability],
    );
  }
  const assignment = await currentAssignment(device.id);
  const token = await issueDeviceToken(
    device.id,
    device.organization_id,
    device.device_type,
    assignment?.role ?? null,
  );
  return {
    deviceId: device.id,
    installationId: input.deviceInstallationId,
    deviceToken: token.token,
    accessToken: token.accessToken,
    enabled: true,
    organizationId: device.organization_id,
    branchId: assignment?.branch_id ?? null,
    classroomId: assignment?.classroom_id ?? null,
    role: assignment?.role ?? "RECEIVER",
  };
}

export async function deviceConfig(principal: Extract<Principal, { kind: "device" }>) {
  const db = requirePool();
  const result = await db.query(
    `select d.id, d.device_installation_id, d.device_type, d.label, d.manufacturer, d.model, d.android_version, d.app_version, d.framework_version, d.enabled,
            o.id as organization_id, o.name as organization_name, o.code as organization_code,
            a.id as assignment_id, a.branch_id, a.classroom_id, a.role, a.effective_from, a.effective_until,
            b.name as branch_name, b.code as branch_code, c.name as classroom_name, c.code as classroom_code,
            coalesce((select jsonb_agg(jsonb_build_object('capability', capability, 'enabled', enabled) order by capability) from public.school_device_capabilities dc where dc.device_id=d.id), '[]'::jsonb) as capabilities,
            r.configuration_version
     from public.school_devices d
     join public.school_organizations o on o.id=d.organization_id
     left join public.school_device_assignments a on a.device_id=d.id and a.effective_until is null
     left join public.school_branches b on b.id=a.branch_id
     left join public.school_classrooms c on c.id=a.classroom_id
     join public.school_organization_revisions r on r.organization_id=d.organization_id
     where d.id=$1 limit 1`,
    [principal.deviceId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "DEVICE_NOT_FOUND", "Device not found");
  await db.query(`update public.school_devices set last_seen_at=now() where id=$1`, [
    principal.deviceId,
  ]);
  return {
    device: {
      id: row.id,
      installationId: row.device_installation_id,
      type: row.device_type,
      label: row.label,
      manufacturer: row.manufacturer,
      model: row.model,
      androidVersion: row.android_version,
      appVersion: row.app_version,
      frameworkVersion: row.framework_version,
      enabled: row.enabled,
    },
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      code: row.organization_code,
    },
    branch: row.branch_id
      ? { id: row.branch_id, name: row.branch_name, code: row.branch_code }
      : null,
    classroom: row.classroom_id
      ? { id: row.classroom_id, name: row.classroom_name, code: row.classroom_code }
      : null,
    assignment: row.assignment_id
      ? {
          id: row.assignment_id,
          role: row.role,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
        }
      : null,
    capabilities: row.capabilities,
    serverTime: Date.now(),
    configurationVersion: Number(row.configuration_version),
  };
}

export async function heartbeat(
  principal: Extract<Principal, { kind: "device" }>,
  input: {
    timestamp?: number;
    networkType?: string;
    batteryLevel?: number;
    isCharging?: boolean;
    appVersion?: string;
    frameworkVersion?: string;
  },
) {
  if (input.batteryLevel !== undefined && (input.batteryLevel < 0 || input.batteryLevel > 100))
    throw new ApiError(400, "INVALID_BATTERY_LEVEL", "batteryLevel must be between 0 and 100");
  const db = requirePool();
  await withTransaction(async (client) => {
    await client.query(
      `insert into public.school_device_heartbeats (device_id, occurred_at, network_type, battery_level, is_charging, app_version, framework_version) values ($1, now(), $2, $3, $4, $5, $6)`,
      [
        principal.deviceId,
        input.networkType ?? null,
        input.batteryLevel ?? null,
        input.isCharging ?? null,
        input.appVersion ?? null,
        input.frameworkVersion ?? null,
      ],
    );
    await client.query(
      `update public.school_devices set last_seen_at=now(), app_version=coalesce($2, app_version), framework_version=coalesce($3, framework_version) where id=$1`,
      [principal.deviceId, input.appVersion ?? null, input.frameworkVersion ?? null],
    );
  });
  return { accepted: true, serverTime: Date.now() };
}

export async function assignDevice(input: {
  deviceId: string;
  organizationId: string;
  branchId?: string | null;
  classroomId?: string | null;
  role: "RECEIVER" | "SENDER" | "ADMIN";
}) {
  return withTransaction(async (client) => {
    const deviceResult = await client.query(
      `select id, organization_id from public.school_devices where id=$1 for update`,
      [input.deviceId],
    );
    const device = deviceResult.rows[0] as { id: string; organization_id: string } | undefined;
    if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND", "Device not found");
    requireSameOrganization(
      {
        kind: "device",
        deviceId: device.id,
        organizationId: device.organization_id,
        deviceType: "ADMIN_DEVICE",
        assignmentRole: "ADMIN",
      },
      input.organizationId,
    );
    if (input.branchId) {
      const branch = await client.query(
        `select id from public.school_branches where id=$1 and organization_id=$2 and enabled=true`,
        [input.branchId, input.organizationId],
      );
      if (!branch.rowCount)
        throw new ApiError(400, "INVALID_BRANCH", "Branch does not belong to the organization");
    }
    if (input.classroomId) {
      const classroom = await client.query(
        `select id, branch_id from public.school_classrooms where id=$1 and organization_id=$2 and enabled=true`,
        [input.classroomId, input.organizationId],
      );
      if (!classroom.rowCount)
        throw new ApiError(
          400,
          "INVALID_CLASSROOM",
          "Classroom does not belong to the organization",
        );
      if (input.branchId && classroom.rows[0].branch_id !== input.branchId)
        throw new ApiError(400, "CLASSROOM_BRANCH_MISMATCH", "Classroom does not belong to branch");
    }
    await client.query(
      `update public.school_device_assignments set effective_until=now() where device_id=$1 and effective_until is null`,
      [input.deviceId],
    );
    const inserted = await client.query(
      `insert into public.school_device_assignments (device_id, organization_id, branch_id, classroom_id, role) values ($1,$2,$3,$4,$5) returning *`,
      [
        input.deviceId,
        input.organizationId,
        input.branchId ?? null,
        input.classroomId ?? null,
        input.role,
      ],
    );
    await client.query(
      `insert into public.school_organization_revisions (organization_id) values ($1) on conflict do nothing`,
      [input.organizationId],
    );
    await client.query(
      `update public.school_organization_revisions set configuration_version=configuration_version+1, updated_at=now() where organization_id=$1`,
      [input.organizationId],
    );
    return inserted.rows[0];
  });
}

export async function isDeviceActive(deviceId: string, organizationId: string): Promise<boolean> {
  const db = requirePool();
  const result = await db.query(
    `select 1 from public.school_devices d join public.school_organizations o on o.id=d.organization_id where d.id=$1 and d.organization_id=$2 and d.enabled=true and o.enabled=true`,
    [deviceId, organizationId],
  );
  return Boolean(result.rowCount);
}
