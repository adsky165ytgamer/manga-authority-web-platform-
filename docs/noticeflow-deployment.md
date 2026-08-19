# NoticeFlow deployment

NoticeFlow is split into two deployable processes: the Fastify backend in `backend/` and the TanStack Start frontend in the repository root. Both use the same Supabase project, but only the backend connects to Postgres with a server-side database credential.

## 1. Apply the database migration

Apply `supabase/migrations/20260819140000_school_notice_backend.sql` to the target Supabase project. The migration creates the namespaced `school_*` tables, enum types, triggers, revision cursor, immutable notice recipient snapshots, delivery audit tables, and RLS boundaries.

## 2. Configure Supabase Auth

Enable email/password authentication in Supabase Auth. Create each operator account in Supabase Auth, then provision the corresponding `school_users` row through `POST /api/v1/admin/users` using its Supabase Auth UUID. The backend rejects accounts that do not have an enabled `school_users` record in an enabled organization.

## 3. Deploy the backend

Build and run the backend with:

```bash
pnpm install
pnpm backend:check
pnpm backend:build
NODE_ENV=production node backend/dist/server.js
```

Required backend variables are documented in `backend/.env.example`. In production, set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SCHOOL_JWT_SECRET`, and `DEVICE_ENROLLMENT_SECRET`. The service exposes `GET /health/live`, `GET /health/ready`, REST under `/api/v1`, WebSocket at `/api/v1/realtime`, and OpenAPI JSON at `/docs/openapi.json`.

The included `backend/Dockerfile` builds the server as a standalone container. Put it behind an HTTPS reverse proxy. WebSocket upgrade support must be enabled for `/api/v1/realtime`.

## 4. Deploy the frontend

Set `VITE_SCHOOL_API_URL` to the HTTPS origin of the deployed backend before building the frontend. The value is documented in the root `.env.example`.

```bash
pnpm install
pnpm build:platform
```

The frontend is a TanStack Start application and can be deployed using the repository's existing Nitro/Vite hosting configuration. The browser uses the real REST API for authentication, organization context, notices, devices, diagnostics, and receiver testing. It does not contain mock repositories or hardcoded school data.

## 5. First-run sequence

Sign in with the initial operator account. Provision branches and classrooms, enroll receiver devices from the Receiver Lab or Android client, then assign devices to their current branch/classroom. Grant `school_user_scopes` to teachers or staff who need classroom-level send permissions. Create a notice from Notice Center and verify the revision in Diagnostics. The Receiver Lab can register a real device credential and exercise `/config`, `/sync`, and acknowledgement behavior from the browser.

## 6. Operational verification

Run the following before promoting a release:

```bash
pnpm backend:check
pnpm backend:test
pnpm build:platform
```

Then verify health, login, organization isolation, device registration, assignment, notice creation, offline sync with a stale revision, repeat acknowledgement, retraction, and WebSocket reconnect behavior against the deployed database.
