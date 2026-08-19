import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app";
import {
  createAccessToken,
  createOpaqueToken,
  sha256,
  verifyAccessToken,
} from "../src/security/tokens";

test("access tokens round-trip and reject tampering", () => {
  const token = createAccessToken({
    typ: "device",
    sub: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    deviceType: "RECEIVER_PANEL",
    assignmentRole: "RECEIVER",
  });
  const claims = verifyAccessToken(token);
  assert.equal(claims?.typ, "device");
  assert.equal(claims?.sub, "00000000-0000-4000-8000-000000000001");
  assert.equal(verifyAccessToken(`${token}x`), null);
});

test("opaque credentials are not stored in plaintext", () => {
  const token = createOpaqueToken();
  assert.notEqual(token, sha256(token));
  assert.equal(sha256(token).length, 64);
});

test("liveness endpoint works without a configured database", async () => {
  const app = await createApp();
  const response = await app.inject({ method: "GET", url: "/health/live" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ok");
  await app.close();
});

test("protected endpoints reject missing bearer tokens", async () => {
  const app = await createApp();
  const response = await app.inject({ method: "GET", url: "/api/v1/sync?after=0" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHENTICATED");
  await app.close();
});
