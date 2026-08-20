import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

type StaffRole = "ADMIN" | "TEACHER";

export type Staff = { uid: string; organizationId: string; role: StaffRole; displayName: string; enabled: boolean };

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Firebase Authentication is required.");
  return auth.uid;
}

export async function requireStaff(uid: string): Promise<Staff> {
  const snapshot = await getFirestore().collection("users").doc(uid).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "The authenticated user is not provisioned as school staff.");
  const data = snapshot.data() as Partial<Staff>;
  if (!data.enabled || !data.organizationId || (data.role !== "ADMIN" && data.role !== "TEACHER") || !data.displayName) {
    throw new HttpsError("permission-denied", "The staff profile is disabled or incomplete.");
  }
  return { uid, organizationId: data.organizationId, role: data.role, displayName: data.displayName, enabled: true };
}

export async function requireAdmin(uid: string): Promise<Staff> {
  const staff = await requireStaff(uid);
  if (staff.role !== "ADMIN") throw new HttpsError("permission-denied", "Administrator access is required.");
  return staff;
}

export function requireAnonymous(auth: { token?: Record<string, unknown>; uid: string } | undefined): string {
  const uid = requireUid(auth);
  if (auth?.token?.firebase && typeof auth.token.firebase === "object") {
    const firebase = auth.token.firebase as Record<string, unknown>;
    if (firebase.sign_in_provider === "anonymous") return uid;
  }
  throw new HttpsError("permission-denied", "Receiver enrollment requires an anonymously authenticated Firebase user.");
}
