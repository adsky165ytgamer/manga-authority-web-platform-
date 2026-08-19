# Permanent hosting

The repository now includes `render.yaml`, `backend/Dockerfile`, and `Dockerfile.web` for a durable two-service deployment. The backend and frontend are deployed separately because the browser needs the public backend origin at build time.

## Publish from GitHub

Create a Render Blueprint from the `main` branch of `adsky165ytgamer/manga-authority-web-platform-` and select `render.yaml`. The blueprint creates `noticeflow-backend` and `noticeflow-frontend` with automatic deploys from GitHub.

Before the first deploy, provide these backend values in the Render dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase/PostgreSQL connection string with migration access |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `BACKEND_CORS_ORIGIN` | The final frontend URL, for example `https://noticeflow-frontend.onrender.com` |

The blueprint generates `SCHOOL_JWT_SECRET` and `DEVICE_ENROLLMENT_SECRET` server-side. Never expose either secret to the browser.

After the backend first deploys, copy its public HTTPS URL into the frontend service's `VITE_SCHOOL_API_URL` environment variable and redeploy the frontend. The frontend build embeds that value into the browser bundle, so it must be known at build time. Then update `BACKEND_CORS_ORIGIN` to the exact final frontend origin and redeploy the backend once more.

## Supabase first run

Apply `supabase/migrations/20260819140000_school_notice_backend.sql` to the project before logging in. Enable Supabase email/password authentication and provision the first organization and operator account. The backend will not admit an Auth user until a matching enabled `school_users` record exists.

## Domain

Once both services are healthy, attach the final custom domain to the frontend service. Point its DNS records to the hosting provider as instructed by the provider. Set `BACKEND_CORS_ORIGIN` to that custom frontend URL and keep `VITE_SCHOOL_API_URL` pointed at the backend's HTTPS URL.

## Release verification

Use the following checklist after deployment:

1. Open `/health/live` and `/health/ready` on the backend.
2. Open the frontend origin and confirm the NoticeFlow landing page loads.
3. Sign in through `/auth` with a provisioned operator account.
4. Create a branch, classroom, and receiver device.
5. Publish a classroom-targeted notice and confirm the recipient count.
6. Open Receiver Lab, enroll a receiver with the enrollment secret, sync, and acknowledge the notice.
7. Confirm the notice and acknowledgement in Notice Center and Diagnostics.

The temporary sandbox preview is not the permanent URL. The permanent URL is assigned by the hosting provider after the Blueprint is created; this workspace cannot create a third-party hosting account or supply Supabase credentials on the user's behalf.
