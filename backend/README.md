# School Notice Platform Backend

This directory contains the real backend for the school-wide notice and classroom communication platform. It uses **Fastify**, **PostgreSQL/Supabase Postgres**, signed short-lived access tokens, hashed refresh/device credentials, a transactional revision cursor, and an authenticated WebSocket wake-up channel.

## Runtime model

The backend is server-authoritative. PostgreSQL is the source of truth for organizations, branches, classrooms, users, devices, assignments, notice recipient snapshots, acknowledgement records, delivery events, and synchronization revisions. A notice is committed before the realtime notification is attempted. Receivers must always call `GET /api/v1/sync`; WebSocket is only a low-latency wake-up mechanism.

The migration creates an immutable `school_notice_recipients` snapshot at notice creation. This means reassignment changes future notices without changing the historical recipient set for a notice already created. Retractions update the canonical notice to a new organization revision and leave the notice row available for synchronization and auditability.

## Required environment

Copy the following variables into the backend process environment. Never commit production secrets.

```dotenv
NODE_ENV=production
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8787
DATABASE_URL=postgresql://...
DATABASE_SSL=true
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SCHOOL_JWT_SECRET=<at-least-32-random-characters>
DEVICE_ENROLLMENT_SECRET=<random-secret>
BACKEND_CORS_ORIGIN=https://your-admin-client.example
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
HEARTBEAT_ONLINE_SECONDS=90
HEARTBEAT_RECENT_SECONDS=300
```

`SUPABASE_PUBLISHABLE_KEY` is used for the email/password login call. Supabase Auth must be configured with the users who are allowed to sign in, and each permitted account must have a matching `school_users.auth_user_id` record. The backend does not invent OTPs or silently accept unauthenticated sender requests.

## Database migration

Apply `supabase/migrations/20260819140000_school_notice_backend.sql` to the same Postgres database referenced by `DATABASE_URL`. The migration is safe to run after the existing Manga Authority migrations because all school-platform objects are namespaced with `school_` and use dedicated enum types. It enables RLS on the school tables and intentionally provides no browser bypass policies; the backend service role/transaction boundary is the only supported access path.

For a Supabase project, apply the migration through the Supabase migration workflow or SQL editor, then set `DATABASE_URL` to a pooled or direct Postgres connection string. Run the backend readiness probe after the migration:

```bash
curl http://localhost:8787/health/ready
```

## Local development

```bash
pnpm install
pnpm backend:check
pnpm backend:dev
```

The backend intentionally fails fast in production if `DATABASE_URL`, `SCHOOL_JWT_SECRET`, Supabase Auth settings, or `DEVICE_ENROLLMENT_SECRET` are missing. In development, device registration may omit the enrollment secret only when `DEVICE_ENROLLMENT_SECRET` is unset; configure the secret locally if you want production-like enrollment behavior.

## Authentication and device enrollment

`POST /api/v1/auth/login` accepts `{ "email", "password" }` and delegates credential verification to Supabase Auth. The response contains a short-lived application access token and a rotating application refresh token. The raw refresh token is never stored; only its SHA-256 hash is stored in `school_refresh_sessions`.

`POST /api/v1/devices/register` is idempotent by `deviceInstallationId`. A first enrollment requires `organizationId` and, in production, `enrollmentSecret`. The response contains a device access token for API use and a device credential for controlled re-registration. The database stores only a SHA-256 hash of device credentials. A device access token cannot create, retract, or administer notices.

## Core receiver contract

The receiver flow is:

1. Register once and persist the returned device access token securely.
2. Call `GET /api/v1/devices/me/config` after installation, boot, reconnect, and periodically thereafter.
3. Send a modest heartbeat to `POST /api/v1/devices/heartbeat`.
4. Connect to `wss://host/api/v1/realtime` with the device access token.
5. On `NOTICE_AVAILABLE`, `NOTICE_RETRACTED`, or reconnect, call `GET /api/v1/sync?after=<localRevision>&limit=100` until `hasMore` is false.
6. Store notices and the revision cursor locally before displaying them.
7. Retry `POST /api/v1/notices/{noticeId}/acknowledge` until it succeeds; the endpoint is idempotent.

Sync responses are ordered by monotonically increasing organization revision and include `nextAfter`. Repeated calls are safe. Retention does not remove notices needed for auditability or retraction synchronization.

## Endpoint groups

| Area           | Endpoints                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health         | `GET /health/live`, `GET /health/ready`                                                                                                               |
| Auth           | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`                                             |
| Devices        | `POST /api/v1/devices/register`, `GET /api/v1/devices/me/config`, `POST /api/v1/devices/heartbeat`                                                    |
| Receiver sync  | `GET /api/v1/sync`, `POST /api/v1/notices/{noticeId}/acknowledge`, `wss://host/api/v1/realtime`                                                       |
| Notices        | `POST /api/v1/notices`, `POST /api/v1/notices/{noticeId}/retract`                                                                                     |
| Administration | Organizations, branches, classrooms, users, user scopes, devices, assignments, notice types, diagnostics, and delivery events under `/api/v1/admin/*` |
| Documentation  | `GET /docs/openapi.json`                                                                                                                              |

All JSON responses use `{ data, requestId }` on success and `{ error, requestId }` on failure. Validation errors are returned as HTTP 400, authorization failures as 401/403, missing resources as 404, conflicts as 409, and infrastructure failures as 500/503.

## Security boundaries

Every organization-owned record carries an organization relationship, and route services check the principal's organization before returning or modifying data. User roles are separated from device principals. Non-administrative senders require explicit `school_user_scopes` rows for a branch or classroom, and organization-wide or branch-wide broadcasts are restricted to organization administrators and principals. The server validates all notice targets against the same organization before allocating a revision.

The backend applies Helmet headers, CORS configuration, request IDs, structured Fastify logging, rate limiting, parameterized SQL, short-lived signed access tokens, rotating hashed refresh sessions, hashed device credentials, and WebSocket cleanup/ping-pong handling. Device heartbeats are retained in a bounded table and can be pruned with `select public.school_cleanup_heartbeats(30)`.

## Verification

```bash
pnpm backend:check
pnpm backend:test
```

A deployment should also run an integration smoke test against a migrated database covering: organization creation, branch/classroom creation, device enrollment, assignment, notice creation, sync from the assigned device, repeated acknowledgement, notice retraction, and a second-organization isolation attempt.
