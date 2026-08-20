# Paste This Entire Prompt into Gemini in Firebase

You are the implementation agent for the current Firebase project. **Do not give me product comparisons, tutorials, a plan, sample data, or follow-up questions for routine implementation choices. Build the backend files now.** Continue until every file below is generated, internally consistent, and ready for Firebase CLI deployment.

Build the production backend for **NoticeFlow**, a live school notice delivery system with a Kotlin Android **Sender** app for teachers and a Kotlin Android **Receiver** app for physical classroom displays.

## Non-negotiable requirements

1. Use **Firebase Authentication**, **Cloud Firestore**, **Cloud Functions for Firebase v2 using TypeScript**, and **Firebase Cloud Messaging**. Firestore is the authoritative source of truth. FCM is a short data-only wake-up signal; a receiver must always fetch the complete notice from Firestore.
2. Use **live runtime data only**. Never create, seed, hardcode, or assume organization names, classroom names, teacher names, device names, receiver IDs, notice content, users, or demo data.
3. Do not rely on the previous custom backend, SQL database, REST API, PostgreSQL, WebSocket server, Supabase, or an APK-embedded server key.
4. Do not use one shared Firebase Auth account for every teacher and receiver. Every teacher must have an individual Firebase Auth UID. Every physical receiver must have its own Firebase Auth UID, initially anonymous and then bound using a one-time enrollment code. This is required for trustworthy Firestore Security Rules.
5. Do not embed secrets, Firebase Admin credentials, FCM server credentials, service-account keys, or permanent enrollment secrets in Android apps or source control. Use the Admin SDK only within Cloud Functions.
6. Do not delete or overwrite existing Firestore data. Do not deploy or create billing changes automatically. Generate and validate files locally; clearly list only the final user-confirmed deployment commands at the end.

## Create these files

Create or update these exact files in the current repository:

```text
firebase.json
firestore.rules
firestore.indexes.json
functions/package.json
functions/tsconfig.json
functions/src/index.ts
functions/src/schema.ts
functions/src/auth.ts
functions/src/fcm.ts
functions/test/*.test.ts
FIREBASE_SETUP.md
```

## Use this Firestore schema

Use generated document IDs and `FieldValue.serverTimestamp()` for server-owned timestamps.

| Collection | Required live fields |
|---|---|
| `organizations/{organizationId}` | `displayName`, `enabled`, `createdAt`, `updatedAt` |
| `classrooms/{classroomId}` | `organizationId`, `displayName`, `enabled`, `createdAt`, `updatedAt` |
| `users/{authUid}` | `organizationId`, `role` (`ADMIN` or `TEACHER`), `displayName`, `enabled`, `createdAt`, `updatedAt` |
| `installations/{installationId}` | `authUid`, `installationType` (`SENDER` or `RECEIVER`), `identityId` nullable, `organizationId` nullable before claim, `classroomId` nullable, `displayName`, `fcmToken` nullable, `enabled`, `lastSeenAt`, `createdAt`, `updatedAt` |
| `notices/{noticeId}` | `organizationId`, `createdByAuthUid`, `createdByInstallationId`, `title`, `description`, `type` (`HOMEWORK`, `IMPORTANT`, `INFORMATION`), `targetType` (`CLASSROOM`), `targetId`, `status` (`PUBLISHED`, `RETRACTED`, `EXPIRED`), `createdAt`, `expiresAt` nullable |
| `acknowledgements/{noticeId}_{installationId}` | `noticeId`, `installationId`, `organizationId`, `classroomId`, `acknowledgedAt`, `createdAt` |
| `deliveryEvents/{eventId}` | `noticeId`, `installationId` nullable, `eventType`, `createdAt`, safe non-sensitive metadata only |
| `receiverEnrollmentCodes/{codeId}` | a secure **hash only** of a short-lived single-use code, `organizationId`, optional `classroomId`, `expiresAt`, `usedAt`, `createdByAuthUid` |

## Implement callable Cloud Functions

Use Zod validation, Firebase Authentication checks, least privilege, server timestamps, atomic transactions where needed, idempotency protection, structured errors, and audit events.

1. `createOrganization`: enabled ADMIN only; creates an organization from a real supplied name.
2. `createClassroom`: enabled ADMIN only; creates a classroom under the caller’s real organization.
3. `provisionTeacher`: enabled ADMIN only; binds an existing authenticated teacher UID to the caller’s organization and the `TEACHER` role.
4. `createReceiverEnrollmentCode`: enabled ADMIN only; creates a short-lived one-time code, stores only its secure hash, and supports an optional pre-assigned classroom.
5. `claimReceiverEnrollment`: called by an anonymously authenticated receiver. It validates and atomically consumes a one-time code, binds the receiver’s unique auth UID and client-generated installation ID to the organization/classroom from that code, records a real display name and FCM token, and prevents the receiver from choosing another organization or classroom.
6. `publishNotice`: enabled teacher only. Validate the caller’s organization and target classroom; create a live notice record. Never accept a client-supplied organization or sender identity outside the caller’s organization.
7. `assignReceiverClassroom`: enabled ADMIN only; updates the selected real receiver installation’s classroom assignment.
8. `retractNotice`: enabled ADMIN or the original teacher within the same organization; changes the Firestore status and creates an audit event.

## Implement FCM delivery

Create a Firestore v2 `onDocumentCreated` trigger for `notices/{noticeId}`. If a notice has `status=PUBLISHED` and targets a classroom, query enabled `RECEIVER` installations in the same `organizationId` and `classroomId`. Send each current FCM token a **data-only** message with exactly `noticeId`, `organizationId`, and `eventType=NOTICE_PUBLISHED`. Do not send notice title/body in the FCM payload. Handle batches safely, record safe delivery events, and mark or remove invalid tokens without logging the token value.

## Write production Firestore Security Rules

Start with deny-all and grant only what is necessary.

- Admins may manage their own organization’s classrooms, users, enrollment codes through callable functions, and receiver assignments through callable functions.
- Teachers may read only their own user document, enabled classrooms in their own organization, and their own organization’s notices as permitted by their role. Teachers must publish through `publishNotice`, not direct Firestore writes.
- Receivers may read only their own installation record and `PUBLISHED` notices matching their own assigned organization/classroom. A receiver may create or update only its own acknowledgement record; it must not change another installation, organization, classroom, role, enabled status, or FCM token.
- Direct client writes to `organizations`, `classrooms`, `users`, `receiverEnrollmentCodes`, `notices`, and `deliveryEvents` must be denied unless explicitly and safely required above. Prefer callable functions for privileged writes.
- FCM tokens must never be exposed by broad collection reads.
- Rules must use `request.auth.uid`, not a shared account UID.

## Create Firestore indexes and tests

Add indexes for:

1. notices: `organizationId`, `targetType`, `targetId`, `status`, `createdAt desc`;
2. installations: `organizationId`, `classroomId`, `installationType`, `enabled`;
3. acknowledgements: `noticeId`, `acknowledgedAt desc`;
4. every additional compound query used by the functions.

Configure the Firebase Emulator Suite and write tests covering: unauthenticated denial, cross-organization denial, teacher notice publishing, one-time receiver enrollment code consumption, receiver targeting, acknowledgement ownership, invalid FCM token handling, and notice retraction.

## Android integration documentation

Write `FIREBASE_SETUP.md` with exact concise steps to:

1. enable Firestore in **Production mode**;
2. enable Email/Password Auth for teachers and Anonymous Auth for receivers;
3. register `com.noticeflow.sender` and `com.noticeflow.receiver` as two Android apps;
4. download one `google-services.json` per Android app and place each file only in the matching module while keeping both out of Git;
5. enable Cloud Messaging and explain that Cloud Functions/FCM Admin delivery normally requires a billing-enabled Firebase project;
6. run Emulator tests, deploy rules/indexes/functions, and set up App Check after the initial tested rollout;
7. create the first real organization, classroom, admin, teacher, and receiver enrollment code without adding demo data.

Finish by showing: (a) the file tree you created, (b) concise validation results, and (c) the exact non-destructive Firebase CLI commands that I can review before deployment. Do not stop for routine questions.
