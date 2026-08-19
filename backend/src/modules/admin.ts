/* eslint-disable @typescript-eslint/no-explicit-any -- pg rows are narrowed at service boundaries. */
import { ApiError } from "../http/http";
import type { UserPrincipal } from "../http/types";
import { requirePool, withTransaction } from "../db/pool";
import { assignDevice } from "./devices";

export async function listOrganizations() {
  const db = requirePool();
  const result = await db.query(
    `select o.*, r.current_revision, r.configuration_version, (select count(*) from public.school_branches b where b.organization_id=o.id) as branch_count, (select count(*) from public.school_devices d where d.organization_id=o.id) as device_count from public.school_organizations o left join public.school_organization_revisions r on r.organization_id=o.id order by o.created_at desc`,
  );
  return result.rows;
}

export async function createOrganization(input: { name: string; code: string; enabled?: boolean }) {
  if (!input.name.trim() || !input.code.trim())
    throw new ApiError(400, "INVALID_ORGANIZATION", "name and code are required");
  const db = requirePool();
  try {
    const result = await db.query(
      `insert into public.school_organizations (name, code, enabled) values ($1,$2,$3) returning *`,
      [input.name.trim(), input.code.trim().toUpperCase(), input.enabled ?? true],
    );
    return result.rows[0];
  } catch (error: any) {
    if (error?.code === "23505")
      throw new ApiError(409, "ORGANIZATION_CODE_EXISTS", "Organization code already exists");
    throw error;
  }
}

export async function getOrganization(id: string, principal?: UserPrincipal) {
  if (principal && principal.role !== "SUPER_ADMIN" && principal.organizationId !== id)
    throw new ApiError(404, "NOT_FOUND", "Organization not found");
  const db = requirePool();
  const result = await db.query(
    `select o.*, r.current_revision, r.configuration_version from public.school_organizations o left join public.school_organization_revisions r on r.organization_id=o.id where o.id=$1`,
    [id],
  );
  if (!result.rowCount) throw new ApiError(404, "NOT_FOUND", "Organization not found");
  return result.rows[0];
}

export async function updateOrganization(
  id: string,
  input: { name?: string; code?: string; enabled?: boolean },
  principal?: UserPrincipal,
) {
  await getOrganization(id, principal);
  const db = requirePool();
  const result = await db.query(
    `update public.school_organizations set name=coalesce($2,name), code=coalesce($3,code), enabled=coalesce($4,enabled) where id=$1 returning *`,
    [
      id,
      input.name?.trim() || null,
      input.code?.trim().toUpperCase() || null,
      input.enabled ?? null,
    ],
  );
  return result.rows[0];
}

export async function listBranches(organizationId: string, principal?: UserPrincipal) {
  if (principal && principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select b.*, (select count(*) from public.school_classrooms c where c.branch_id=b.id) as classroom_count from public.school_branches b where b.organization_id=$1 order by b.name`,
    [organizationId],
  );
  return result.rows;
}

export async function createBranch(
  organizationId: string,
  input: { name: string; code: string; enabled?: boolean },
  principal?: UserPrincipal,
) {
  await getOrganization(organizationId, principal);
  const db = requirePool();
  try {
    const result = await db.query(
      `insert into public.school_branches (organization_id, name, code, enabled) values ($1,$2,$3,$4) returning *`,
      [organizationId, input.name.trim(), input.code.trim().toUpperCase(), input.enabled ?? true],
    );
    return result.rows[0];
  } catch (error: any) {
    if (error?.code === "23505")
      throw new ApiError(409, "BRANCH_CODE_EXISTS", "Branch code already exists");
    throw error;
  }
}

export async function updateBranch(
  id: string,
  input: { name?: string; code?: string; enabled?: boolean },
  principal: UserPrincipal,
) {
  const db = requirePool();
  const found = await db.query(`select organization_id from public.school_branches where id=$1`, [
    id,
  ]);
  if (
    !found.rowCount ||
    (principal.role !== "SUPER_ADMIN" && found.rows[0].organization_id !== principal.organizationId)
  )
    throw new ApiError(404, "NOT_FOUND", "Branch not found");
  const result = await db.query(
    `update public.school_branches set name=coalesce($2,name), code=coalesce($3,code), enabled=coalesce($4,enabled) where id=$1 returning *`,
    [
      id,
      input.name?.trim() || null,
      input.code?.trim().toUpperCase() || null,
      input.enabled ?? null,
    ],
  );
  return result.rows[0];
}

export async function listClassrooms(
  organizationId: string,
  branchId: string | undefined,
  principal?: UserPrincipal,
) {
  if (principal && principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select c.*, b.name as branch_name, b.code as branch_code, (select count(*) from public.school_device_assignments a where a.classroom_id=c.id and a.effective_until is null) as active_device_count from public.school_classrooms c join public.school_branches b on b.id=c.branch_id where c.organization_id=$1 and ($2::uuid is null or c.branch_id=$2) order by b.name,c.name`,
    [organizationId, branchId ?? null],
  );
  return result.rows;
}

export async function createClassroom(
  organizationId: string,
  input: {
    branchId: string;
    name: string;
    code: string;
    grade?: string;
    section?: string;
    enabled?: boolean;
  },
  principal?: UserPrincipal,
) {
  await getOrganization(organizationId, principal);
  const db = requirePool();
  const branch = await db.query(
    `select id from public.school_branches where id=$1 and organization_id=$2 and enabled=true`,
    [input.branchId, organizationId],
  );
  if (!branch.rowCount)
    throw new ApiError(400, "INVALID_BRANCH", "Branch does not belong to organization");
  const result = await db.query(
    `insert into public.school_classrooms (organization_id, branch_id, name, code, grade, section, enabled) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      organizationId,
      input.branchId,
      input.name.trim(),
      input.code.trim().toUpperCase(),
      input.grade ?? null,
      input.section ?? null,
      input.enabled ?? true,
    ],
  );
  return result.rows[0];
}

export async function updateClassroom(
  id: string,
  input: {
    name?: string;
    code?: string;
    grade?: string | null;
    section?: string | null;
    enabled?: boolean;
  },
  principal: UserPrincipal,
) {
  const db = requirePool();
  const found = await db.query(`select organization_id from public.school_classrooms where id=$1`, [
    id,
  ]);
  if (
    !found.rowCount ||
    (principal.role !== "SUPER_ADMIN" && found.rows[0].organization_id !== principal.organizationId)
  )
    throw new ApiError(404, "NOT_FOUND", "Classroom not found");
  const result = await db.query(
    `update public.school_classrooms set name=coalesce($2,name), code=coalesce($3,code), grade=$4, section=$5, enabled=coalesce($6,enabled) where id=$1 returning *`,
    [
      id,
      input.name?.trim() || null,
      input.code?.trim().toUpperCase() || null,
      input.grade ?? null,
      input.section ?? null,
      input.enabled ?? null,
    ],
  );
  return result.rows[0];
}

export async function listUsers(organizationId: string, principal: UserPrincipal) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select id, auth_user_id, organization_id, name, phone, email, role, enabled, created_at, updated_at, last_login_at from public.school_users where organization_id=$1 order by name`,
    [organizationId],
  );
  return result.rows;
}

export async function listDevices(organizationId: string, principal: UserPrincipal) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select d.id,d.device_installation_id,d.device_type,d.label,d.manufacturer,d.model,d.android_version,d.app_version,d.framework_version,d.enabled,d.last_seen_at,d.last_sync_at,d.last_boot_at,d.created_at,a.branch_id,a.classroom_id,a.role,b.name as branch_name,c.name as classroom_name, case when d.last_seen_at is null then 'OFFLINE' when d.last_seen_at >= now() - make_interval(secs => $2) then 'ONLINE' when d.last_seen_at >= now() - make_interval(secs => $3) then 'RECENTLY_ONLINE' else 'OFFLINE' end as status from public.school_devices d left join public.school_device_assignments a on a.device_id=d.id and a.effective_until is null left join public.school_branches b on b.id=a.branch_id left join public.school_classrooms c on c.id=a.classroom_id where d.organization_id=$1 order by d.label`,
    [organizationId, 90, 300],
  );
  return result.rows;
}

export async function listNoticeTypes(organizationId: string, principal: UserPrincipal) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select * from public.school_notice_types where organization_id=$1 order by name`,
    [organizationId],
  );
  return result.rows;
}

export async function createNoticeType(
  organizationId: string,
  input: { name: string; code: string; description?: string | null },
  principal: UserPrincipal,
) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `insert into public.school_notice_types (organization_id, name, code, description) values ($1,$2,$3,$4) returning *`,
    [organizationId, input.name.trim(), input.code.trim().toUpperCase(), input.description ?? null],
  );
  return result.rows[0];
}

export async function diagnostics(organizationId: string, principal: UserPrincipal) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const [devices, notices, deliveries, acknowledgements] = await Promise.all([
    db.query(
      `select count(*)::int as total, count(*) filter (where enabled)::int as enabled, count(*) filter (where last_seen_at >= now() - interval '90 seconds')::int as online from public.school_devices where organization_id=$1`,
      [organizationId],
    ),
    db.query(
      `select count(*)::int as total, count(*) filter (where not is_deleted)::int as active, max(revision)::bigint as latest_revision from public.school_notices where organization_id=$1`,
      [organizationId],
    ),
    db.query(
      `select event_type, count(*)::int as count from public.school_notice_delivery_events e join public.school_notices n on n.id=e.notice_id where n.organization_id=$1 and e.occurred_at >= now()-interval '24 hours' group by event_type order by event_type`,
      [organizationId],
    ),
    db.query(
      `select count(*)::int as count from public.school_notice_acknowledgements a join public.school_notices n on n.id=a.notice_id where n.organization_id=$1 and a.server_received_at >= now()-interval '24 hours'`,
      [organizationId],
    ),
  ]);
  return {
    devices: devices.rows[0],
    notices: notices.rows[0],
    deliveryEventsLast24Hours: deliveries.rows,
    acknowledgementsLast24Hours: acknowledgements.rows[0].count,
  };
}

export { assignDevice };

export async function createSchoolUser(
  organizationId: string,
  input: {
    authUserId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role: string;
  },
  principal: UserPrincipal,
) {
  if (
    !["SUPER_ADMIN", "ORGANIZATION_ADMIN"].includes(principal.role) ||
    (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
  )
    throw new ApiError(403, "FORBIDDEN", "Only organization administrators can provision users");
  const db = requirePool();
  const result = await db.query(
    `insert into public.school_users (auth_user_id, organization_id, name, email, phone, role) values ($1,$2,$3,$4,$5,$6) returning id, auth_user_id, organization_id, name, email, phone, role, enabled`,
    [
      input.authUserId,
      organizationId,
      input.name.trim(),
      input.email ?? null,
      input.phone ?? null,
      input.role,
    ],
  );
  return result.rows[0];
}

export async function updateSchoolUser(
  userId: string,
  input: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    role?: string;
    enabled?: boolean;
  },
  principal: UserPrincipal,
) {
  const db = requirePool();
  const found = await db.query(`select organization_id from public.school_users where id=$1`, [
    userId,
  ]);
  if (
    !found.rowCount ||
    (principal.role !== "SUPER_ADMIN" && principal.organizationId !== found.rows[0].organization_id)
  )
    throw new ApiError(404, "NOT_FOUND", "User not found");
  if (!["SUPER_ADMIN", "ORGANIZATION_ADMIN"].includes(principal.role))
    throw new ApiError(403, "FORBIDDEN", "Only administrators can update users");
  const result = await db.query(
    `update public.school_users set name=coalesce($2,name), email=$3, phone=$4, role=coalesce($5,role), enabled=coalesce($6,enabled) where id=$1 returning id, auth_user_id, organization_id, name, email, phone, role, enabled`,
    [
      userId,
      input.name?.trim() || null,
      input.email ?? null,
      input.phone ?? null,
      input.role ?? null,
      input.enabled ?? null,
    ],
  );
  return result.rows[0];
}

export async function grantUserScope(
  input: {
    userId: string;
    organizationId: string;
    branchId?: string | null;
    classroomId?: string | null;
    canSend?: boolean;
    canManage?: boolean;
  },
  principal: UserPrincipal,
) {
  if (
    !["SUPER_ADMIN", "ORGANIZATION_ADMIN"].includes(principal.role) ||
    (principal.role !== "SUPER_ADMIN" && principal.organizationId !== input.organizationId)
  )
    throw new ApiError(403, "FORBIDDEN", "Only organization administrators can grant scopes");
  if (!input.branchId && !input.classroomId)
    throw new ApiError(400, "SCOPE_TARGET_REQUIRED", "branchId or classroomId is required");
  const db = requirePool();
  const user = await db.query(
    `select id from public.school_users where id=$1 and organization_id=$2`,
    [input.userId, input.organizationId],
  );
  if (!user.rowCount)
    throw new ApiError(400, "INVALID_USER", "User does not belong to organization");
  if (input.branchId) {
    const branch = await db.query(
      `select id from public.school_branches where id=$1 and organization_id=$2`,
      [input.branchId, input.organizationId],
    );
    if (!branch.rowCount)
      throw new ApiError(400, "INVALID_BRANCH", "Branch does not belong to organization");
  }
  if (input.classroomId) {
    const classroom = await db.query(
      `select id, branch_id from public.school_classrooms where id=$1 and organization_id=$2`,
      [input.classroomId, input.organizationId],
    );
    if (!classroom.rowCount)
      throw new ApiError(400, "INVALID_CLASSROOM", "Classroom does not belong to organization");
    if (input.branchId && classroom.rows[0].branch_id !== input.branchId)
      throw new ApiError(400, "CLASSROOM_BRANCH_MISMATCH", "Classroom does not belong to branch");
  }
  const result = await db.query(
    `insert into public.school_user_scopes (user_id, organization_id, branch_id, classroom_id, can_send, can_manage) values ($1,$2,$3,$4,$5,$6) on conflict (user_id, branch_id, classroom_id) do update set can_send=excluded.can_send, can_manage=excluded.can_manage returning *`,
    [
      input.userId,
      input.organizationId,
      input.branchId ?? null,
      input.classroomId ?? null,
      input.canSend ?? false,
      input.canManage ?? false,
    ],
  );
  return result.rows[0];
}

export async function listDeliveryEvents(
  organizationId: string,
  noticeId: string | undefined,
  principal: UserPrincipal,
) {
  if (principal.role !== "SUPER_ADMIN" && principal.organizationId !== organizationId)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  const db = requirePool();
  const result = await db.query(
    `select e.*, d.label as device_label from public.school_notice_delivery_events e join public.school_notices n on n.id=e.notice_id left join public.school_devices d on d.id=e.device_id where n.organization_id=$1 and ($2::uuid is null or e.notice_id=$2) order by e.occurred_at desc limit 500`,
    [organizationId, noticeId ?? null],
  );
  return result.rows;
}
