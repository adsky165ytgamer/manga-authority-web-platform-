# Firebase Backend Prompt for NoticeFlow

Paste the following prompt into Gemini in Firebase after Cloud Firestore is enabled.

---

I am building a production **school notice delivery system** named **NoticeFlow** with two Android apps: a **Sender** app for teachers and a **Receiver** app for physical classroom displays. Build the Firebase backend for real live data only. Do **not** create mock organizations, sample classrooms, hardcoded device names, fake users, placeholder notices, or seeded documents.

Use **Firebase Authentication**, **Cloud Firestore**, **Cloud Functions for Firebase (TypeScript, Node.js)**, and **Firebase Cloud Messaging**. Firestore is the source of truth. Use FCM only as a data-message wake-up signal; every receiver must read the authoritative notice from Firestore after an FCM message arrives.

Use a secure identity model. **Do not use one shared Firebase Auth account for teachers and receiver panels**, because that prevents secure Firestore authorization. Each teacher must have an individual Firebase Auth UID. Each physical receiver must have its own Firebase Auth UID, preferably created with Anonymous Authentication and then bound through a one-time enrollment process. No Firebase Admin credentials, FCM server credentials, API secrets, or permanent enrollment secrets may ever be embedded in either Android APK.

Create the following Firestore model. Use generated document IDs, Firebase server timestamps, explicit `organizationId` fields, and `enabled` booleans. All display names, classroom data, device data, and organization data must be entered or provisioned live by an authorized user.

| Collection | Required fields | Purpose |
|---|---|---|
| `organizations/{organizationId}` | `displayName`, `enabled`, `createdAt`, `updatedAt` | School organization. |
| `classrooms/{classroomId}` | `organizationId`, `displayName`, `enabled`, `createdAt`, `updatedAt` | Live classroom list shown to Senders. |
| `users/{authUid}` | `organizationId`, `role` (`ADMIN` or `TEACHER`), `displayName`, `enabled`, `createdAt`, `updatedAt` | Staff authorization and profile. |
| `installations/{installationId}` | `authUid`, `installationType` (`SENDER` or `RECEIVER`), `organizationId`, `classroomId` nullable, `displayName`, `fcmToken` nullable, `enabled`, `lastSeenAt`, `createdAt`, `updatedAt` | Per-device live identity and receiver assignment. |
| `notices/{noticeId}` | `organizationId`, `createdByAuthUid`, `createdByInstallationId`, `title`, `description`, `type` (`HOMEWORK`, `IMPORTANT`, `INFORMATION`), `targetType` (`CLASSROOM`), `targetId`, `status` (`PUBLISHED`, `RETRACTED`, `EXPIRED`), `createdAt`, `expiresAt` nullable | Authoritative notice records. |
| `acknowledgements/{noticeId}_{installationId}` | `noticeId`, `installationId`, `organizationId`, `classroomId`, `acknowledgedAt`, `createdAt` | Receiver completion record. |
| `deliveryEvents/{eventId}` | `noticeId`, `installationId`, `eventType`, `createdAt`, `metadata` | Delivery/audit trail; never expose sensitive FCM token values. |
| `receiverEnrollmentCodes/{codeId}` | Store only a **hash** of a short-lived single-use enrollment code, `organizationId`, optional `classroomId`, `expiresAt`, `usedAt`, `createdByAuthUid` | Securely binds a new anonymous receiver installation to a school without an APK secret. |

Implement these callable Cloud Functions with schema validation, Firebase Authentication checks, rate limiting where appropriate, structured errors, server timestamps, idempotency protection, and audit events:

1. `createOrganization` — admin-only; creates a real organization after the admin supplies a name.
2. `createClassroom` — admin-only; creates a classroom under a selected organization.
3. `provisionTeacher` — admin-only; associates an already-authenticated teacher UID with an organization and the `TEACHER` role.
4. `createReceiverEnrollmentCode` — admin-only; generates a short-lived, one-time, non-recoverable enrollment code and stores only its secure hash.
5. `claimReceiverEnrollment` — callable by an anonymously authenticated receiver. It validates the one-time code, accepts a generated installation ID, receiver display name, and current FCM token, binds the receiver’s unique Auth UID to its installation, applies the organization/classroom assignment from the code, marks the code used atomically, and returns the safe configuration. It must not allow the receiver to choose another organization or classroom.
6. `publishNotice` — callable by an enabled teacher. It validates the teacher’s organization and target classroom, creates the notice, writes an audit event, and lets the FCM trigger deliver wake-up messages. Never accept a client-provided sender name or organization outside the teacher’s assigned organization.
7. `assignReceiverClassroom` — admin-only; updates a receiver installation’s classroom assignment using a real installation ID selected from live Firestore data.
8. `retractNotice` — admin-only or creator-within-organization; changes the authoritative Firestore status and emits an audit event.

Add a Firestore `onDocumentCreated` Cloud Function for `notices/{noticeId}`. On a `PUBLISHED` classroom notice, query enabled `RECEIVER` installations for the same `organizationId` and `classroomId`, retrieve their current FCM tokens, and send data-only FCM messages containing only `noticeId`, `organizationId`, and `eventType=NOTICE_PUBLISHED`. Use Firebase Admin SDK, batch safely, remove or flag invalid tokens, and write delivery events. The Android receiver will fetch the full notice from Firestore and will not trust the FCM payload as the notice body.

Write `firestore.rules` using least privilege and deny by default. Requirements:

- Teachers can read only their own user document, their assigned organization/classrooms, and notices in their organization created by them or targeted to their organization’s classrooms. Teachers must use `publishNotice` for writes instead of direct notice creation.
- Receiver clients can read only their own installation document and published notices in their assigned organization/classroom. They can create/update only their own acknowledgement document and must not alter organization, classroom, role, enabled status, or another installation.
- Direct client writes to `organizations`, `classrooms`, `users`, `receiverEnrollmentCodes`, and `deliveryEvents` must be denied; these are managed by callable functions or admin tooling.
- FCM tokens must be readable and writable only by the owning receiver UID or trusted server code. Do not expose FCM tokens in broad list queries.
- Do not base authorization on a shared account UID. Use each caller’s unique `request.auth.uid` plus server-validated organization membership.

Create the required `firestore.indexes.json` for: (1) notices by `organizationId`, `targetType`, `targetId`, `status`, and `createdAt desc`; (2) installations by `organizationId`, `classroomId`, `installationType`, and `enabled`; (3) acknowledgements by `noticeId` and `acknowledgedAt desc`; and (4) any additional compound query actually used by the functions or Android apps.

Create a `firebase.json`, a TypeScript `functions/` project, `firestore.rules`, `firestore.indexes.json`, and a concise `FIREBASE_SETUP.md` that explains how to enable Email/Password Auth, Anonymous Auth for receivers, Cloud Firestore, Cloud Messaging, Cloud Functions billing requirements, Android app registration for `com.noticeflow.sender` and `com.noticeflow.receiver`, and safe placement of each module’s `google-services.json`. Add Emulator Suite configuration and tests for the enrollment-code, authorization, publish, receiver-targeting, acknowledgement, and FCM token-invalidations paths.

Before modifying any existing Firestore data, ask for confirmation. Do not deploy rules in test mode. Do not insert demo records. Do not log credentials, enrollment codes, FCM tokens, passwords, or full personally identifying data.

---

## Console Steps After Gemini Generates the Backend

Create **Cloud Firestore in Production mode** and select the closest permanent region. Then enable **Email/Password Authentication** for staff and **Anonymous Authentication** for receiver panels. Register two Android apps: `com.noticeflow.sender` and `com.noticeflow.receiver`. Download one `google-services.json` file per app, keep both out of Git, and place each only in its matching Android module. Cloud Functions that send FCM through Firebase Admin normally require a billing-enabled Firebase project.
