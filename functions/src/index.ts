import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { requireAdmin, requireAnonymous, requireStaff, requireUid } from "./auth.js";
import { wakeClassroomReceivers } from "./fcm.js";
import { assignReceiverInput, bootstrapFirstAdminInput, claimEnrollmentInput, classroomInput, enrollmentCodeInput, organizationInput, provisionTeacherInput, publishNoticeInput, refreshReceiverFcmTokenInput, registerSenderInstallationInput, retractNoticeInput } from "./schema.js";

initializeApp();
const database = getFirestore();
const region = "us-central1";
const callableOptions = { region, maxInstances: 10, concurrency: 40 };
const hashEnrollmentCode = (code: string) => createHash("sha256").update(code).digest("hex");
const parse = <T>(schema: { parse: (input: unknown) => T }, input: unknown): T => {
  try { return schema.parse(input); } catch (error) { throw new HttpsError("invalid-argument", "Input validation failed.", error); }
};

export const bootstrapFirstAdmin = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const input = parse(bootstrapFirstAdminInput, request.data);
  const result = await database.runTransaction(async (transaction) => {
    const existing = await transaction.get(database.collection("users").limit(1));
    if (!existing.empty) throw new HttpsError("failed-precondition", "An administrator already exists; use the approved administration flow.");
    const organization = database.collection("organizations").doc();
    transaction.set(organization, { displayName: input.organizationDisplayName, enabled: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(database.collection("users").doc(uid), { organizationId: organization.id, role: "ADMIN", displayName: input.administratorDisplayName, enabled: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { organizationId: organization.id };
  });
  return result;
});

export const createOrganization = onCall(callableOptions, async (request) => {
  const admin = await requireAdmin(requireUid(request.auth));
  const input = parse(organizationInput, request.data);
  const organization = database.collection("organizations").doc();
  await organization.set({ displayName: input.displayName, enabled: true, createdByAuthUid: admin.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { organizationId: organization.id };
});

export const createClassroom = onCall(callableOptions, async (request) => {
  const admin = await requireAdmin(requireUid(request.auth));
  const input = parse(classroomInput, request.data);
  const classroom = database.collection("classrooms").doc();
  await classroom.set({ organizationId: admin.organizationId, displayName: input.displayName, enabled: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { classroomId: classroom.id };
});

export const provisionTeacher = onCall(callableOptions, async (request) => {
  const admin = await requireAdmin(requireUid(request.auth));
  const input = parse(provisionTeacherInput, request.data);
  const account = await getAuth().getUser(input.uid).catch(() => { throw new HttpsError("not-found", "The supplied Firebase Auth user does not exist."); });
  await database.collection("users").doc(account.uid).set({ organizationId: admin.organizationId, role: "TEACHER", displayName: input.displayName, enabled: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { uid: account.uid };
});

export const createReceiverEnrollmentCode = onCall(callableOptions, async (request) => {
  const admin = await requireAdmin(requireUid(request.auth));
  const input = parse(enrollmentCodeInput, request.data);
  if (input.classroomId) {
    const classroom = await database.collection("classrooms").doc(input.classroomId).get();
    if (!classroom.exists || classroom.get("organizationId") !== admin.organizationId) throw new HttpsError("permission-denied", "The classroom is not part of your organization.");
  }
  const code = randomBytes(32).toString("base64url");
  const document = database.collection("receiverEnrollmentCodes").doc();
  await document.set({ codeHash: hashEnrollmentCode(code), organizationId: admin.organizationId, classroomId: input.classroomId ?? null, expiresAt: Timestamp.fromMillis(Date.now() + input.expiresInMinutes * 60_000), usedAt: null, createdByAuthUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
  return { enrollmentCode: code, expiresAt: Date.now() + input.expiresInMinutes * 60_000 };
});

export const claimReceiverEnrollment = onCall(callableOptions, async (request) => {
  const uid = requireAnonymous(request.auth);
  const input = parse(claimEnrollmentInput, request.data);
  const codeHash = hashEnrollmentCode(input.code);
  return database.runTransaction(async (transaction) => {
    const found = await transaction.get(database.collection("receiverEnrollmentCodes").where("codeHash", "==", codeHash).limit(1));
    const code = found.docs[0];
    if (!code || code.get("usedAt") || code.get("expiresAt")?.toMillis?.() < Date.now()) throw new HttpsError("permission-denied", "The enrollment code is invalid, expired, or already used.");
    const installation = database.collection("installations").doc(input.installationId);
    const existing = await transaction.get(installation);
    if (existing.exists && existing.get("authUid") !== uid) throw new HttpsError("already-exists", "This installation ID is already claimed by a different receiver.");
    const organizationId = code.get("organizationId") as string;
    const classroomId = code.get("classroomId") as string | null;
    transaction.update(code.ref, { usedAt: FieldValue.serverTimestamp(), usedByAuthUid: uid });
    transaction.set(installation, { authUid: uid, installationType: "RECEIVER", organizationId, classroomId, displayName: input.displayName, fcmToken: input.fcmToken ?? null, enabled: true, lastSeenAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(database.collection("receiverProfiles").doc(uid), { authUid: uid, installationId: installation.id, organizationId, classroomId, enabled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(database.collection("deliveryEvents").doc(), { installationId: installation.id, eventType: "RECEIVER_ENROLLED", createdAt: FieldValue.serverTimestamp() });
    return { installationId: installation.id, organizationId, classroomId };
  });
});

export const registerSenderInstallation = onCall(callableOptions, async (request) => {
  const staff = await requireStaff(requireUid(request.auth));
  const input = parse(registerSenderInstallationInput, request.data);
  const installation = database.collection("installations").doc(input.installationId);
  await database.runTransaction(async (transaction) => {
    const existing = await transaction.get(installation);
    if (existing.exists && existing.get("authUid") !== staff.uid) throw new HttpsError("already-exists", "This installation ID is already registered to another user.");
    transaction.set(installation, { authUid: staff.uid, installationType: "SENDER", organizationId: staff.organizationId, classroomId: null, displayName: input.displayName, enabled: true, lastSeenAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { installationId: installation.id, organizationId: staff.organizationId };
});

export const refreshReceiverFcmToken = onCall(callableOptions, async (request) => {
  const uid = requireAnonymous(request.auth);
  const input = parse(refreshReceiverFcmTokenInput, request.data);
  const [profile, installation] = await Promise.all([database.collection("receiverProfiles").doc(uid).get(), database.collection("installations").doc(input.installationId).get()]);
  if (!profile.exists || !installation.exists || profile.get("installationId") !== input.installationId || installation.get("authUid") !== uid || installation.get("installationType") !== "RECEIVER") {
    throw new HttpsError("permission-denied", "The receiver installation is not enrolled to this Firebase identity.");
  }
  await installation.ref.update({ fcmToken: input.fcmToken, fcmTokenUpdatedAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { installationId: installation.id };
});

export const publishNotice = onCall(callableOptions, async (request) => {
  const staff = await requireStaff(requireUid(request.auth));
  const input = parse(publishNoticeInput, request.data);
  const [classroom, installation] = await Promise.all([database.collection("classrooms").doc(input.classroomId).get(), database.collection("installations").doc(input.installationId).get()]);
  if (!classroom.exists || classroom.get("organizationId") !== staff.organizationId || !classroom.get("enabled")) throw new HttpsError("permission-denied", "The selected classroom is not enabled in your organization.");
  if (!installation.exists || installation.get("authUid") !== staff.uid || installation.get("installationType") !== "SENDER" || installation.get("organizationId") !== staff.organizationId) throw new HttpsError("permission-denied", "The sender installation is not authorized for this account.");
  const notice = database.collection("notices").doc();
  await database.batch().set(notice, { organizationId: staff.organizationId, createdByAuthUid: staff.uid, createdByInstallationId: installation.id, title: input.title, description: input.description, type: input.type, targetType: "CLASSROOM", targetId: classroom.id, status: "PUBLISHED", createdAt: FieldValue.serverTimestamp(), expiresAt: input.expiresAt ? Timestamp.fromDate(new Date(input.expiresAt)) : null }).set(database.collection("deliveryEvents").doc(), { noticeId: notice.id, eventType: "NOTICE_PUBLISHED", createdByAuthUid: staff.uid, createdAt: FieldValue.serverTimestamp() }).commit();
  return { noticeId: notice.id };
});

export const assignReceiverClassroom = onCall(callableOptions, async (request) => {
  const admin = await requireAdmin(requireUid(request.auth));
  const input = parse(assignReceiverInput, request.data);
  const installation = database.collection("installations").doc(input.installationId);
  const receiver = await installation.get();
  if (!receiver.exists || receiver.get("installationType") !== "RECEIVER" || receiver.get("organizationId") !== admin.organizationId) throw new HttpsError("permission-denied", "The receiver is not in your organization.");
  if (input.classroomId) {
    const classroom = await database.collection("classrooms").doc(input.classroomId).get();
    if (!classroom.exists || classroom.get("organizationId") !== admin.organizationId) throw new HttpsError("permission-denied", "The classroom is not in your organization.");
  }
  await database.batch().update(installation, { classroomId: input.classroomId, updatedAt: FieldValue.serverTimestamp() }).set(database.collection("receiverProfiles").doc(receiver.get("authUid")), { classroomId: input.classroomId, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).commit();
  return { installationId: installation.id, classroomId: input.classroomId };
});

export const retractNotice = onCall(callableOptions, async (request) => {
  const staff = await requireStaff(requireUid(request.auth));
  const input = parse(retractNoticeInput, request.data);
  const notice = database.collection("notices").doc(input.noticeId);
  const snapshot = await notice.get();
  if (!snapshot.exists || snapshot.get("organizationId") !== staff.organizationId) throw new HttpsError("not-found", "The notice was not found in your organization.");
  if (staff.role !== "ADMIN" && snapshot.get("createdByAuthUid") !== staff.uid) throw new HttpsError("permission-denied", "Only the original teacher or an administrator may retract this notice.");
  await database.batch().update(notice, { status: "RETRACTED", retractedAt: FieldValue.serverTimestamp(), retractedByAuthUid: staff.uid }).set(database.collection("deliveryEvents").doc(), { noticeId: notice.id, eventType: "NOTICE_RETRACTED", createdByAuthUid: staff.uid, createdAt: FieldValue.serverTimestamp() }).commit();
  return { noticeId: notice.id, status: "RETRACTED" };
});

export const onNoticeCreated = onDocumentCreated({ region, document: "notices/{noticeId}", maxInstances: 10 }, async (event) => {
  const notice = event.data;
  if (!notice) return;
  const data = notice.data();
  if (data.status !== "PUBLISHED" || data.targetType !== "CLASSROOM" || typeof data.organizationId !== "string" || typeof data.targetId !== "string") return;
  await wakeClassroomReceivers(notice.id, data.organizationId, data.targetId);
  logger.info("Queued classroom receivers for notice", { noticeId: notice.id });
});
