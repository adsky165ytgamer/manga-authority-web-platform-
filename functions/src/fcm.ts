import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

type Receiver = { id: string; fcmToken: string };
const invalidTokenCodes = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]);

export async function wakeClassroomReceivers(noticeId: string, organizationId: string, classroomId: string): Promise<void> {
  const database = getFirestore();
  const snapshots = await database.collection("installations")
    .where("organizationId", "==", organizationId)
    .where("classroomId", "==", classroomId)
    .where("installationType", "==", "RECEIVER")
    .where("enabled", "==", true)
    .get();
  const receivers: Receiver[] = snapshots.docs.flatMap((document) => {
    const token = document.get("fcmToken");
    return typeof token === "string" && token.length > 0 ? [{ id: document.id, fcmToken: token }] : [];
  });
  for (let offset = 0; offset < receivers.length; offset += 500) {
    const batch = receivers.slice(offset, offset + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch.map((receiver) => receiver.fcmToken),
      data: { noticeId, organizationId, eventType: "NOTICE_PUBLISHED" },
      android: { priority: "high" }
    });
    const write = database.batch();
    response.responses.forEach((item, index) => {
      const receiver = batch[index];
      if (!receiver) return;
      const event = database.collection("deliveryEvents").doc();
      if (item.success) {
        write.set(event, { noticeId, installationId: receiver.id, eventType: "FCM_WAKE_UP_ACCEPTED", createdAt: FieldValue.serverTimestamp() });
      } else {
        const code = item.error?.code ?? "unknown";
        write.set(event, { noticeId, installationId: receiver.id, eventType: "FCM_WAKE_UP_FAILED", errorCode: code, createdAt: FieldValue.serverTimestamp() });
        if (invalidTokenCodes.has(code)) {
          write.update(database.collection("installations").doc(receiver.id), { fcmToken: FieldValue.delete(), fcmTokenInvalidatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        }
      }
    });
    await write.commit();
    logger.info("Processed classroom wake-up batch", { noticeId, delivered: response.successCount, failed: response.failureCount });
  }
}
