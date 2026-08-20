# NoticeFlow Android

This directory contains the Android Sender and Receiver applications plus the shared `:school-notice-core` Kotlin library. The applications use **Firebase Authentication, Cloud Firestore, Cloud Functions, and Firebase Cloud Messaging** only. They do not call the older REST, PostgreSQL, Supabase, or WebSocket backend.

## Firebase Configuration

Register both Android application IDs in the same Firebase project:

| Application | Package ID | Configuration file destination |
|---|---|---|
| Sender | `com.noticeflow.sender` | `android/sender-app/google-services.json` |
| Receiver | `com.noticeflow.receiver` | `android/receiver-app/google-services.json` |

Keep both configuration files out of Git. Do not store Firebase Admin credentials, FCM server credentials, enrollment codes, school names, classroom names, device names, API secrets, or service-account keys in Gradle properties or source code.

## Build

```bash
cd android
./gradlew :receiver-app:assembleDebug :sender-app:assembleDebug
```

The generated debug APKs are written to `receiver-app/build/outputs/apk/debug/receiver-app-debug.apk` and `sender-app/build/outputs/apk/debug/sender-app-debug.apk`.

## Live Sender and Receiver Flow

An administrator provisions each sender Firebase Auth UID into a real organization. The Sender app signs in with Email/Password, registers its generated installation ID through the secured `registerSenderInstallation` Cloud Function, loads live classrooms from Firestore, and publishes notices through the secured `publishNotice` Function.

Each Receiver creates its own anonymous Firebase Auth identity, receives an administrator-issued short-lived one-time enrollment code, and claims the code through `claimReceiverEnrollment`. The receiver then receives a data-only FCM wake-up, retrieves the authoritative notice from Firestore, persists it in Room, displays it only when it matches the live classroom assignment, and writes an acknowledgement owned by that receiver identity.

Deploy the Firebase backend before real-device testing by following `FIREBASE_SETUP.md` at the repository root. Use the Firebase Emulator Suite before the first production deployment.
