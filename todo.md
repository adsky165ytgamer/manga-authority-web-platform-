# SchoolNotice Android Build Checklist

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
