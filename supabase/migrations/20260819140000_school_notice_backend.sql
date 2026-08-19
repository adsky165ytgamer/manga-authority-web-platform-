create extension if not exists pgcrypto;

create type public.school_user_role as enum ('SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_ADMIN','PRINCIPAL','TEACHER','STAFF','VIEWER');
create type public.school_device_type as enum ('RECEIVER_PHONE','RECEIVER_TV','RECEIVER_PANEL','SENDER_PHONE','ADMIN_DEVICE');
create type public.school_assignment_role as enum ('RECEIVER','SENDER','ADMIN');
create type public.school_notice_priority as enum ('NORMAL','HIGH','EMERGENCY');
create type public.school_notice_target_type as enum ('ORGANIZATION','BRANCH','CLASSROOM','DEVICE');
create type public.school_delivery_event_type as enum ('CREATED','MATCHED','PUSH_ATTEMPTED','PUSHED','SYNCED','DISPLAYED','ACKNOWLEDGED','EXPIRED','RETRACTED','FAILED');

create or replace function public.school_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.school_organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  code varchar(80) not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  name varchar(200) not null,
  code varchar(80) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.school_classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  branch_id uuid not null references public.school_branches(id) on delete cascade,
  name varchar(200) not null,
  code varchar(80) not null,
  grade varchar(80),
  section varchar(80),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table if not exists public.school_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  name varchar(200) not null,
  phone varchar(40),
  email varchar(320),
  role public.school_user_role not null default 'VIEWER',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.school_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  device_installation_id uuid not null unique,
  device_type public.school_device_type not null,
  label varchar(200) not null,
  manufacturer varchar(200),
  model varchar(200),
  android_version varchar(80),
  app_version varchar(80),
  framework_version varchar(80),
  enabled boolean not null default true,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  last_boot_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_device_assignments (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.school_devices(id) on delete cascade,
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  branch_id uuid references public.school_branches(id) on delete restrict,
  classroom_id uuid references public.school_classrooms(id) on delete restrict,
  role public.school_assignment_role not null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  constraint school_assignment_range_check check (effective_until is null or effective_until > effective_from)
);

create unique index if not exists school_one_current_assignment_per_device
  on public.school_device_assignments(device_id) where effective_until is null;

create table if not exists public.school_device_capabilities (
  device_id uuid not null references public.school_devices(id) on delete cascade,
  capability varchar(100) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (device_id, capability)
);

create table if not exists public.school_device_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.school_devices(id) on delete cascade,
  token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.school_device_heartbeats (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.school_devices(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  network_type varchar(40),
  battery_level numeric(5,2),
  is_charging boolean,
  app_version varchar(80),
  framework_version varchar(80)
);

create table if not exists public.school_notice_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  name varchar(120) not null,
  code varchar(80) not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.school_organization_revisions (
  organization_id uuid primary key references public.school_organizations(id) on delete cascade,
  current_revision bigint not null default 0,
  configuration_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.school_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  created_by_user_id uuid references public.school_users(id) on delete set null,
  created_by_device_id uuid references public.school_devices(id) on delete set null,
  type_id uuid references public.school_notice_types(id) on delete set null,
  title varchar(200) not null,
  description text not null,
  priority public.school_notice_priority not null default 'NORMAL',
  target_type public.school_notice_target_type not null,
  target_branch_id uuid references public.school_branches(id) on delete restrict,
  target_classroom_id uuid references public.school_classrooms(id) on delete restrict,
  target_device_id uuid references public.school_devices(id) on delete restrict,
  revision bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  metadata jsonb
);

create table if not exists public.school_notice_recipients (
  notice_id uuid not null references public.school_notices(id) on delete cascade,
  device_id uuid not null references public.school_devices(id) on delete cascade,
  matched_at timestamptz not null default now(),
  primary key (notice_id, device_id)
);

create table if not exists public.school_notice_acknowledgements (
  notice_id uuid not null references public.school_notices(id) on delete cascade,
  device_id uuid not null references public.school_devices(id) on delete cascade,
  acknowledged_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  primary key (notice_id, device_id)
);

create table if not exists public.school_notice_delivery_events (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.school_notices(id) on delete cascade,
  device_id uuid references public.school_devices(id) on delete cascade,
  event_type public.school_delivery_event_type not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb
);

create table if not exists public.school_refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  refresh_token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null
);

create table if not exists public.school_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.school_organizations(id) on delete cascade,
  actor_user_id uuid references public.school_users(id) on delete set null,
  actor_device_id uuid references public.school_devices(id) on delete set null,
  action varchar(120) not null,
  resource_type varchar(80) not null,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists school_branch_org_idx on public.school_branches(organization_id);
create index if not exists school_classroom_org_branch_idx on public.school_classrooms(organization_id, branch_id);
create index if not exists school_users_org_role_idx on public.school_users(organization_id, role);
create index if not exists school_devices_org_enabled_idx on public.school_devices(organization_id, enabled);
create index if not exists school_assignments_device_effective_idx on public.school_device_assignments(device_id, effective_from desc);
create index if not exists school_notices_org_revision_idx on public.school_notices(organization_id, revision);
create index if not exists school_recipient_device_idx on public.school_notice_recipients(device_id, notice_id);
create index if not exists school_heartbeats_device_time_idx on public.school_device_heartbeats(device_id, occurred_at desc);
create index if not exists school_delivery_notice_device_idx on public.school_notice_delivery_events(notice_id, device_id, occurred_at desc);

create or replace function public.school_seed_notice_types() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.school_organization_revisions (organization_id) values (new.id) on conflict do nothing;
  insert into public.school_notice_types (organization_id, name, code, description) values
    (new.id, 'General Notice', 'GENERAL_NOTICE', 'General school communication'),
    (new.id, 'Holiday', 'HOLIDAY', 'School closure or holiday'),
    (new.id, 'Homework', 'HOMEWORK', 'Homework and classwork'),
    (new.id, 'Period Change', 'PERIOD_CHANGE', 'Timetable or period change'),
    (new.id, 'Teacher Absent', 'TEACHER_ABSENT', 'Teacher absence'),
    (new.id, 'Emergency', 'EMERGENCY', 'Emergency notice'),
    (new.id, 'Announcement', 'ANNOUNCEMENT', 'General announcement'),
    (new.id, 'Event', 'EVENT', 'School event'),
    (new.id, 'Exam', 'EXAM', 'Examination notice'),
    (new.id, 'Custom', 'CUSTOM', 'Custom organization notice type')
  on conflict do nothing;
  return new;
end; $$;

drop trigger if exists school_seed_notice_types_trigger on public.school_organizations;
create trigger school_seed_notice_types_trigger after insert on public.school_organizations for each row execute function public.school_seed_notice_types();

create or replace function public.school_validate_classroom_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.school_branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'branch must belong to classroom organization';
  end if;
  return new;
end; $$;

drop trigger if exists school_validate_classroom_org_trigger on public.school_classrooms;
create trigger school_validate_classroom_org_trigger before insert or update on public.school_classrooms for each row execute function public.school_validate_classroom_org();

create or replace function public.school_cleanup_heartbeats(retention_days integer default 30) returns bigint
language plpgsql security definer set search_path = public as $$
declare deleted_count bigint;
begin
  delete from public.school_device_heartbeats where occurred_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;

alter table public.school_organizations enable row level security;
alter table public.school_branches enable row level security;
alter table public.school_classrooms enable row level security;
alter table public.school_users enable row level security;
alter table public.school_devices enable row level security;
alter table public.school_device_assignments enable row level security;
alter table public.school_device_capabilities enable row level security;
alter table public.school_device_tokens enable row level security;
alter table public.school_device_heartbeats enable row level security;
alter table public.school_notice_types enable row level security;
alter table public.school_organization_revisions enable row level security;
alter table public.school_notices enable row level security;
alter table public.school_notice_recipients enable row level security;
alter table public.school_notice_acknowledgements enable row level security;
alter table public.school_notice_delivery_events enable row level security;
alter table public.school_refresh_sessions enable row level security;
alter table public.school_audit_log enable row level security;

-- The dedicated backend connects with the Supabase service role for transactional APIs.
-- No anon/authenticated policy is added here so browser clients cannot bypass the API boundary.

create trigger school_org_updated_at before update on public.school_organizations for each row execute function public.school_touch_updated_at();
create trigger school_branch_updated_at before update on public.school_branches for each row execute function public.school_touch_updated_at();
create trigger school_classroom_updated_at before update on public.school_classrooms for each row execute function public.school_touch_updated_at();
create trigger school_user_updated_at before update on public.school_users for each row execute function public.school_touch_updated_at();
create trigger school_device_updated_at before update on public.school_devices for each row execute function public.school_touch_updated_at();

comment on table public.school_notice_recipients is 'Immutable recipient snapshot resolved at notice creation; this prevents reassignment from changing historical delivery semantics.';
comment on table public.school_organization_revisions is 'Atomic per-organization synchronization cursor; allocate by row lock inside a transaction.';
comment on table public.school_device_tokens is 'Only SHA-256 hashes are stored; raw device credentials are returned once during registration.';

create table if not exists public.school_user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.school_users(id) on delete cascade,
  organization_id uuid not null references public.school_organizations(id) on delete cascade,
  branch_id uuid references public.school_branches(id) on delete cascade,
  classroom_id uuid references public.school_classrooms(id) on delete cascade,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  constraint school_scope_target_check check (branch_id is not null or classroom_id is not null),
  unique (user_id, branch_id, classroom_id)
);
create index if not exists school_user_scopes_user_idx on public.school_user_scopes(user_id, can_send);
alter table public.school_user_scopes enable row level security;
