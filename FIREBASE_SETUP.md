# NoticeFlow Firebase Setup

This repository contains the Firebase backend for the Android Sender and Receiver apps. It deliberately creates **no organizations, classrooms, staff, receivers, devices, or notices**. Those records are created from real live inputs after deployment.

## 1. Firebase Console Configuration

Create Cloud Firestore in **Production mode** and select the region carefully because the region is permanent. Enable **Email/Password** Firebase Authentication for staff members and **Anonymous** Firebase Authentication for physical Receiver panels. Enable Cloud Messaging. Cloud Functions that use Firebase Admin SDK to send FCM wake-up messages normally require a billing-enabled Firebase project.

Register these Android application IDs exactly:

| Application | Android package ID | Configuration file destination |
|---|---|---|
| NoticeFlow Sender | `com.noticeflow.sender` | `android/sender-app/google-services.json` |
| NoticeFlow Receiver | `com.noticeflow.receiver` | `android/receiver-app/google-services.json` |

The configuration files identify the Firebase project but are not source-control files. Keep them in the matching local app module only; `.gitignore` already excludes them.

## 2. Install and Validate Backend Files

From the repository root, authenticate the Firebase CLI and select the real project. Review the project ID carefully before deployment.

```bash
npm install --prefix functions
npm run build --prefix functions
npx firebase login
npx firebase use --add
npx firebase emulators:start
```

Run the Emulator Suite tests before a production deployment:

```bash
npm run test --prefix functions
```

## 3. Review Before Live Deployment

The following command changes the deployed rules, indexes, and Functions. Review it, confirm the intended Firebase project, and run it only after the Emulator Suite tests have passed.

```bash
npx firebase deploy --only functions,firestore:rules,firestore:indexes
```

## 4. First Real Organization and Staff

Use the deployed `bootstrapFirstAdmin` callable function once with the first verified Firebase user. It creates the first real organization and the user’s `ADMIN` profile from submitted data. Then use the Android Sender or an approved admin client to create real classrooms, provision verified teacher Firebase UIDs, issue a receiver enrollment code, and pair each physical display. No Firebase data is generated automatically.

## 5. Security Operations

Keep Functions unprivileged outside their Firebase Admin runtime, do not distribute service-account private keys, and do not put FCM server credentials in the Android apps. Enable App Check after testing the initial real device path, create budget alerts, and keep development/staging/production Firebase projects separate when the project grows.
