# NoticeFlow Android

This directory contains the production-shaped Android workspace requested for NoticeFlow. `:school-notice-core` owns typed backend communication, encrypted session/device storage, Room persistence, revision sync, acknowledgement replay, diagnostics, network state, and the WebSocket wake-up path. `:receiver-app` and `:sender-app` are intentionally thin applications built on that shared infrastructure.

## Build

Set only public deployment origins when building. Do not put a Supabase service role key, database URL, JWT signing secret, or device enrollment secret in Gradle properties or an APK.

```bash
cd android
./gradlew :receiver-app:assembleDebug :sender-app:assembleDebug \
  -PNOTICEFLOW_API_URL=https://api.example.com \
  -PNOTICEFLOW_WS_URL=wss://api.example.com
```

The generated debug APKs are written to `receiver-app/build/outputs/apk/debug/receiver-app-debug.apk` and `sender-app/build/outputs/apk/debug/sender-app-debug.apk`.

## First receiver run

Install the Receiver APK, enter a display label, organization UUID, and the deployment-time enrollment secret, then start the runtime. The receiver stores only its app-generated installation UUID and issued device credentials; it does not use IMEI, MAC address, Android ID, or a hardware fingerprint for backend identity.

The receiver considers WebSocket notifications a wake-up signal only. It retrieves authoritative notice changes through `/api/v1/sync`, writes them to Room, advances the revision cursor only after persistence, and replays unsynced acknowledgements after reconnecting.

## Sender run

Install the Sender APK, sign in using the NoticeFlow user credentials supplied by Supabase-backed backend authentication, then compose a notice. The initial sender screen sends the actual API fields supported today: title, description, target type, and optional target identifier. A future sender UI can add administration views by consuming the existing `/api/v1/admin/*` backend contracts without duplicating auth, HTTP, retries, or serialization.
