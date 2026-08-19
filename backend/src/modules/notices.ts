/* eslint-disable @typescript-eslint/no-explicit-any -- pg rows are narrowed at service boundaries. */
import { ApiError } from "../http/http";
import type { UserPrincipal } from "../http/types";
import { notifyOrganization, notifyDevices } from "../realtime/hub";
import { requirePool, withTransaction } from "../db/pool";

export type NoticeInput = {
  typeId?: string | null;
  title: string;
  description: string;
  priority?: "NORMAL" | "HIGH" | "EMERGENCY";
  targetType: "ORGANIZATION" | "BRANCH" | "CLASSROOM" | "DEVICE";
  targetBranchId?: string | null;
  targetClassroomId?: string | null;
  targetDeviceId?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function allocateRevision(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: string,
): Promise<number> {
  await client.query(
    `insert into public.school_organization_revisions (organization_id) values ($1) on conflict do nothing`,
    [organizationId],
  );
  const locked = await client.query(
    `select current_revision from public.school_organization_revisions where organization_id=$1 for update`,
    [organizationId],
  );
  const next = Number(locked.rows[0].current_revision) + 1;
  await client.query(
    `update public.school_organization_revisions set current_revision=$2, updated_at=now() where organization_id=$1`,
    [organizationId, next],
  );
  return next;
}

async function assertCanSend(
  client: {
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  },
  principal: UserPrincipal,
  input: NoticeInput,
): Promise<void> {
  if (["SUPER_ADMIN", "ORGANIZATION_ADMIN", "PRINCIPAL"].includes(principal.role)) return;
  if (input.targetType === "ORGANIZATION" || input.targetType === "BRANCH")
    throw new ApiError(
      403,
      "SEND_SCOPE_REQUIRED",
      "This role may only send to an assigned classroom or device",
    );
  let classroomId = input.targetType === "CLASSROOM" ? input.targetClassroomId : null;
  let branchId: string | null = null;
  if (input.targetType === "DEVICE" && input.targetDeviceId) {
    const assignment = await client.query(
      `select branch_id, classroom_id from public.school_device_assignments where device_id=$1 and effective_until is null limit 1`,
      [input.targetDeviceId],
    );
    classroomId = assignment.rows[0]?.classroom_id ?? null;
    branchId = assignment.rows[0]?.branch_id ?? null;
  }
  if (classroomId) {
    const classroom = await client.query(
      `select branch_id from public.school_classrooms where id=$1 and organization_id=$2`,
      [classroomId, principal.organizationId],
    );
    branchId = classroom.rows[0]?.branch_id ?? branchId;
  }
  const result = await client.query(
    `select 1 from public.school_user_scopes s
     where s.user_id=$1 and s.organization_id=$2 and s.can_send=true
       and ((s.classroom_id is not null and s.classroom_id=$3)
         or (s.branch_id is not null and s.branch_id=$4))
     limit 1`,
    [principal.userId, principal.organizationId, classroomId, branchId],
  );
  if (!result.rowCount)
    throw new ApiError(
      403,
      "SEND_SCOPE_REQUIRED",
      "You do not have send permission for this classroom",
    );
}

async function validateTarget(
  client: {
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  },
  organizationId: string,
  input: NoticeInput,
): Promise<void> {
  if (input.targetType === "ORGANIZATION") return;
  if (input.targetType === "BRANCH") {
    if (!input.targetBranchId)
      throw new ApiError(400, "TARGET_REQUIRED", "targetBranchId is required");
    const result = await client.query(
      `select id from public.school_branches where id=$1 and organization_id=$2 and enabled=true`,
      [input.targetBranchId, organizationId],
    );
    if (!result.rowCount)
      throw new ApiError(
        400,
        "INVALID_TARGET",
        "Target branch does not belong to the organization",
      );
    return;
  }
  if (input.targetType === "CLASSROOM") {
    if (!input.targetClassroomId)
      throw new ApiError(400, "TARGET_REQUIRED", "targetClassroomId is required");
    const result = await client.query(
      `select id from public.school_classrooms where id=$1 and organization_id=$2 and enabled=true`,
      [input.targetClassroomId, organizationId],
    );
    if (!result.rowCount)
      throw new ApiError(
        400,
        "INVALID_TARGET",
        "Target classroom does not belong to the organization",
      );
    return;
  }
  if (!input.targetDeviceId)
    throw new ApiError(400, "TARGET_REQUIRED", "targetDeviceId is required");
  const result = await client.query(
    `select id from public.school_devices where id=$1 and organization_id=$2 and enabled=true`,
    [input.targetDeviceId, organizationId],
  );
  if (!result.rowCount)
    throw new ApiError(400, "INVALID_TARGET", "Target device does not belong to the organization");
}

async function recipientIds(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: string,
  input: NoticeInput,
): Promise<string[]> {
  if (input.targetType === "ORGANIZATION") {
    const result = await client.query(
      `select id from public.school_devices where organization_id=$1 and enabled=true`,
      [organizationId],
    );
    return result.rows.map((row) => row.id as string);
  }
  if (input.targetType === "BRANCH") {
    const result = await client.query(
      `select distinct d.id from public.school_devices d join public.school_device_assignments a on a.device_id=d.id and a.effective_until is null where d.organization_id=$1 and d.enabled=true and a.branch_id=$2`,
      [organizationId, input.targetBranchId],
    );
    return result.rows.map((row) => row.id as string);
  }
  if (input.targetType === "CLASSROOM") {
    const result = await client.query(
      `select distinct d.id from public.school_devices d join public.school_device_assignments a on a.device_id=d.id and a.effective_until is null where d.organization_id=$1 and d.enabled=true and a.classroom_id=$2`,
      [organizationId, input.targetClassroomId],
    );
    return result.rows.map((row) => row.id as string);
  }
  return input.targetDeviceId ? [input.targetDeviceId] : [];
}

function serializeNotice(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    typeId: row.type_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    targetType: row.target_type,
    targetBranchId: row.target_branch_id,
    targetClassroomId: row.target_classroom_id,
    targetDeviceId: row.target_device_id,
    revision: Number(row.revision),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now()),
    acknowledgedAt: row.acknowledged_at ?? null,
    metadata: row.metadata ?? null,
  };
}

export async function createNotice(principal: UserPrincipal, input: NoticeInput) {
  if (!input.title?.trim() || input.title.length > 200)
    throw new ApiError(
      400,
      "INVALID_TITLE",
      "title is required and must be at most 200 characters",
    );
  if (!input.description?.trim())
    throw new ApiError(400, "INVALID_DESCRIPTION", "description is required");
  if (input.priority && !["NORMAL", "HIGH", "EMERGENCY"].includes(input.priority))
    throw new ApiError(400, "INVALID_PRIORITY", "Unsupported notice priority");
  const result = await withTransaction(async (client) => {
    await assertCanSend(client, principal, input);
    await validateTarget(client, principal.organizationId, input);
    if (input.typeId) {
      const type = await client.query(
        `select id from public.school_notice_types where id=$1 and organization_id=$2 and enabled=true`,
        [input.typeId, principal.organizationId],
      );
      if (!type.rowCount)
        throw new ApiError(
          400,
          "INVALID_NOTICE_TYPE",
          "Notice type does not belong to the organization",
        );
    }
    const revision = await allocateRevision(client, principal.organizationId);
    const inserted = await client.query(
      `insert into public.school_notices (organization_id, created_by_user_id, type_id, title, description, priority, target_type, target_branch_id, target_classroom_id, target_device_id, revision, expires_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [
        principal.organizationId,
        principal.userId,
        input.typeId ?? null,
        input.title.trim(),
        input.description.trim(),
        input.priority ?? "NORMAL",
        input.targetType,
        input.targetBranchId ?? null,
        input.targetClassroomId ?? null,
        input.targetDeviceId ?? null,
        revision,
        input.expiresAt ? new Date(input.expiresAt) : null,
        input.metadata ?? null,
      ],
    );
    const notice = inserted.rows[0];
    const ids = await recipientIds(client, principal.organizationId, input);
    for (const deviceId of ids) {
      await client.query(
        `insert into public.school_notice_recipients (notice_id, device_id) values ($1,$2) on conflict do nothing`,
        [notice.id, deviceId],
      );
      await client.query(
        `insert into public.school_notice_delivery_events (notice_id, device_id, event_type) values ($1,$2,'MATCHED')`,
        [notice.id, deviceId],
      );
    }
    await client.query(
      `insert into public.school_notice_delivery_events (notice_id, event_type, metadata) values ($1,'CREATED',$2)`,
      [notice.id, JSON.stringify({ revision, recipientCount: ids.length })],
    );
    await client.query(
      `insert into public.school_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, metadata) values ($1,$2,'CREATE','NOTICE',$3,$4)`,
      [
        principal.organizationId,
        principal.userId,
        notice.id,
        JSON.stringify({ revision, targetType: input.targetType }),
      ],
    );
    return { notice, ids, recipientCount: ids.length };
  });
  notifyOrganization(principal.organizationId, result.ids, {
    type: "NOTICE_AVAILABLE",
    revision: Number(result.notice.revision),
    noticeId: result.notice.id,
  });
  return {
    notice: serializeNotice(result.notice),
    revision: Number(result.notice.revision),
    recipientCount: result.recipientCount,
  };
}

export async function syncForDevice(deviceId: string, after: number, limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const db = requirePool();
  const result = await db.query(
    `select n.*, a.acknowledged_at
     from public.school_notices n
     join public.school_notice_recipients r on r.notice_id=n.id and r.device_id=$1
     left join public.school_notice_acknowledgements a on a.notice_id=n.id and a.device_id=$1
     where n.revision > $2
     order by n.revision asc
     limit $3`,
    [deviceId, after, safeLimit + 1],
  );
  const hasMore = result.rows.length > safeLimit;
  const rows = hasMore ? result.rows.slice(0, safeLimit) : result.rows;
  const latest = await db.query(
    `select current_revision from public.school_organization_revisions r join public.school_devices d on d.organization_id=r.organization_id where d.id=$1`,
    [deviceId],
  );
  const latestRevision = Number(latest.rows[0]?.current_revision ?? after);
  if (rows.length) {
    await withTransaction(async (client) => {
      for (const row of rows)
        await client.query(
          `insert into public.school_notice_delivery_events (notice_id, device_id, event_type) values ($1,$2,'SYNCED')`,
          [row.id, deviceId],
        );
      await client.query(
        `update public.school_devices set last_sync_at=now(), last_seen_at=now() where id=$1`,
        [deviceId],
      );
    });
  } else {
    await db.query(
      `update public.school_devices set last_sync_at=now(), last_seen_at=now() where id=$1`,
      [deviceId],
    );
  }
  const nextAfter = hasMore ? Number(rows[rows.length - 1].revision) : latestRevision;
  return {
    notices: rows.map(serializeNotice),
    latestRevision,
    hasMore,
    nextAfter,
    serverTime: Date.now(),
  };
}

export async function acknowledge(deviceId: string, noticeId: string, acknowledgedAt?: number) {
  const db = requirePool();
  const found = await db.query(
    `select n.id from public.school_notices n join public.school_notice_recipients r on r.notice_id=n.id and r.device_id=$2 where n.id=$1`,
    [noticeId, deviceId],
  );
  if (!found.rowCount)
    throw new ApiError(404, "NOTICE_NOT_FOUND", "Notice is not assigned to this device");
  const serverReceivedAt = new Date();
  await withTransaction(async (client) => {
    await client.query(
      `insert into public.school_notice_acknowledgements (notice_id, device_id, acknowledged_at, server_received_at) values ($1,$2,$3,$4) on conflict (notice_id, device_id) do update set acknowledged_at=least(public.school_notice_acknowledgements.acknowledged_at, excluded.acknowledged_at), server_received_at=excluded.server_received_at`,
      [
        noticeId,
        deviceId,
        acknowledgedAt ? new Date(acknowledgedAt) : serverReceivedAt,
        serverReceivedAt,
      ],
    );
    await client.query(
      `insert into public.school_notice_delivery_events (notice_id, device_id, event_type) values ($1,$2,'ACKNOWLEDGED')`,
      [noticeId, deviceId],
    );
  });
  return { noticeId, deviceId, acknowledged: true, serverReceivedAt: serverReceivedAt.getTime() };
}

export async function retractNotice(principal: UserPrincipal, noticeId: string) {
  const result = await withTransaction(async (client) => {
    const found = await client.query(
      `select * from public.school_notices where id=$1 and organization_id=$2 for update`,
      [noticeId, principal.organizationId],
    );
    const notice = found.rows[0];
    if (!notice) throw new ApiError(404, "NOTICE_NOT_FOUND", "Notice not found");
    if (notice.is_deleted) return { notice, ids: [] as string[], alreadyRetracted: true };
    const revision = await allocateRevision(client, principal.organizationId);
    const updated = await client.query(
      `update public.school_notices set is_deleted=true, deleted_at=now(), revision= $2 where id=$1 returning *`,
      [noticeId, revision],
    );
    const recipients = await client.query(
      `select device_id from public.school_notice_recipients where notice_id=$1`,
      [noticeId],
    );
    const ids = recipients.rows.map((row) => row.device_id as string);
    for (const deviceId of ids)
      await client.query(
        `insert into public.school_notice_delivery_events (notice_id, device_id, event_type) values ($1,$2,'RETRACTED')`,
        [noticeId, deviceId],
      );
    await client.query(
      `insert into public.school_notice_delivery_events (notice_id, event_type, metadata) values ($1,'RETRACTED',$2)`,
      [noticeId, JSON.stringify({ revision })],
    );
    await client.query(
      `insert into public.school_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, metadata) values ($1,$2,'RETRACT','NOTICE',$3,$4)`,
      [principal.organizationId, principal.userId, noticeId, JSON.stringify({ revision })],
    );
    return { notice: updated.rows[0], ids, alreadyRetracted: false };
  });
  if (!result.alreadyRetracted)
    notifyOrganization(principal.organizationId, result.ids, {
      type: "NOTICE_RETRACTED",
      revision: Number(result.notice.revision),
      noticeId,
    });
  return { noticeId, retracted: true, revision: Number(result.notice.revision) };
}

export async function listNotices(
  organizationId: string,
  input: { limit: number; before?: string },
) {
  const db = requirePool();
  const result = await db.query(
    `select n.*, count(distinct r.device_id)::int as recipient_count, count(distinct a.device_id)::int as acknowledged_count
     from public.school_notices n
     left join public.school_notice_recipients r on r.notice_id=n.id
     left join public.school_notice_acknowledgements a on a.notice_id=n.id
     where n.organization_id=$1 and ($2::timestamptz is null or n.created_at < $2)
     group by n.id
     order by n.created_at desc
     limit $3`,
    [organizationId, input.before ?? null, Math.min(Math.max(input.limit, 1), 100) + 1],
  );
  const hasMore = result.rows.length > input.limit;
  const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  return {
    notices: rows.map((row) => ({
      ...serializeNotice(row),
      recipientCount: Number(row.recipient_count),
      acknowledgedCount: Number(row.acknowledged_count),
    })),
    hasMore,
    nextBefore: hasMore ? (rows[rows.length - 1]?.created_at ?? null) : null,
  };
}
