export type Role =
  | "SUPER_ADMIN"
  | "ORGANIZATION_ADMIN"
  | "BRANCH_ADMIN"
  | "PRINCIPAL"
  | "TEACHER"
  | "STAFF"
  | "VIEWER";
export type DeviceType =
  "RECEIVER_PHONE" | "RECEIVER_TV" | "RECEIVER_PANEL" | "SENDER_PHONE" | "ADMIN_DEVICE";
export type AssignmentRole = "RECEIVER" | "SENDER" | "ADMIN";

export type UserPrincipal = {
  kind: "user";
  userId: string;
  authUserId: string;
  organizationId: string;
  role: Role;
};

export type DevicePrincipal = {
  kind: "device";
  deviceId: string;
  organizationId: string;
  deviceType: DeviceType;
  assignmentRole: AssignmentRole | null;
};

export type Principal = UserPrincipal | DevicePrincipal;

export type RequestContext = {
  principal?: Principal;
  requestId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    schoolContext: RequestContext;
  }
}
