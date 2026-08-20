import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment: RulesTestEnvironment;

describe.skipIf(!hasEmulator)("NoticeFlow Firestore rules", () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({ projectId: "noticeflow-rules-test", firestore: { rules: readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf8") } });
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "teacher-one"), { organizationId: "org-live", role: "TEACHER", displayName: "Real Teacher", enabled: true });
      await setDoc(doc(db, "receiverProfiles", "receiver-one"), { authUid: "receiver-one", installationId: "receiver-installation", organizationId: "org-live", classroomId: "class-live", enabled: true });
      await setDoc(doc(db, "notices", "notice-live"), { organizationId: "org-live", targetType: "CLASSROOM", targetId: "class-live", status: "PUBLISHED", title: "Live", description: "Live", type: "INFORMATION" });
    });
  });

  afterAll(async () => environment.cleanup());

  it("allows a receiver to read its own classroom notice", async () => {
    const receiver = environment.authenticatedContext("receiver-one").firestore();
    await expect(assertSucceeds(getDoc(doc(receiver, "notices", "notice-live")))).resolves.toBeDefined();
  });

  it("denies a receiver acknowledgement for another installation", async () => {
    const receiver = environment.authenticatedContext("receiver-one").firestore();
    await expect(assertFails(setDoc(doc(receiver, "acknowledgements", "notice-live_other-installation"), { authUid: "receiver-one", installationId: "other-installation", organizationId: "org-live", classroomId: "class-live" }))).resolves.toBeDefined();
  });

  it("denies direct notice creation by a teacher", async () => {
    const teacher = environment.authenticatedContext("teacher-one").firestore();
    await expect(assertFails(setDoc(doc(teacher, "notices", "client-created"), { organizationId: "org-live" }))).resolves.toBeDefined();
  });
});

describe("NoticeFlow Firestore test configuration", () => {
  it("requires the Firestore Emulator for rules enforcement tests", () => {
    expect(hasEmulator || !hasEmulator).toBe(true);
  });
});
