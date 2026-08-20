# SchoolNotice Android Build Checklist

- [ ] Access the user’s Firebase console session and identify the target Firebase project without creating duplicate school/device data.
- [ ] Register the Sender and Receiver Android package IDs in the target Firebase project and retrieve the corresponding configuration files securely.
- [ ] Configure the chosen Firebase Authentication provider, create Firestore with secure rules, and enable Cloud Messaging.
- [ ] Deploy the Cloud Function that sends FCM data wake-ups after a new Firestore notice is created.
- [ ] Verify the configured Firebase project with a real Sender, classroom, Receiver installation, notice, acknowledgement, and FCM delivery test.

- [ ] Read the complete Firebase rebuild specification, including the sender, receiver, Firestore, FCM, security-rule, and Cloud Function requirements.
- [x] Replace the prior custom HTTP, PostgreSQL, WebSocket, and enrollment-secret integrations with Firebase Authentication, Cloud Firestore, Cloud Functions, and Firebase Cloud Messaging.
- [x] Define the live Firestore collections for organizations, installations, identities, classrooms, devices, notices, acknowledgements, and delivery events without seed or hardcoded school/device records.
- [x] Implement Firebase authentication and per-installation identity setup using stable generated installation IDs.
- [x] Implement Firestore-driven sender target selection, secured notice publication, receiver enrollment, receiver assignment, acknowledgement, and offline persistence.
- [x] Implement FCM receiver token registration, custom data-message wake-ups, background processing, overlay presentation, and retry-safe Firestore refresh.
- [x] Add Firestore Security Rules, indexes, Firebase CLI configuration, privileged Cloud Functions, and Emulator verification.
- [ ] Install Firebase project-specific `google-services.json` files, deploy the reviewed Functions/rules/indexes, and verify real Sender → Firestore → FCM → Receiver delivery in the user’s Firebase project.

- [x] Install and verify the Android SDK command-line toolchain for API 36, build tools, and a compatible Gradle wrapper.
- [x] Generate the Kotlin multi-module Android project in the repository and make both application modules buildable.
- [x] Read and consolidate all 1,485 lines of the SchoolNoticeCore specification, including receiver, sender, security, offline-sync, and packaging requirements.
- [ ] Inspect the existing NoticeFlow backend API contract and identify any Android-facing endpoint, token, and WebSocket gaps.
- [x] Establish an Android multi-module Gradle project with `:school-notice-core`, `:receiver-app`, and `:sender-app`.
- [x] Implement shared Kotlin models, Ktor HTTP/WebSocket clients, authentication and device credential storage, Room persistence, and environment configuration.
- [x] Implement receiver enrollment, configuration observation, heartbeat, revision sync, notice persistence, acknowledgement, retry queues, diagnostics, and overlay hooks.
- [x] Implement sender authentication, organizational targeting, notice creation, delivery inspection, and device/diagnostic views on the shared framework.
- [x] Add security controls, logging redaction, test coverage, signing configuration templates, and Android build documentation.
- [ ] Run end-to-end receiver-to-backend-to-sender verification once a deployed backend URL, Supabase project, organization UUID, and enrollment secret are available.
