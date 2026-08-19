const API_BASE = (import.meta.env.VITE_SCHOOL_API_URL ?? "http://localhost:8787").replace(
  /\/$/,
  "",
);
const USER_SESSION_KEY = "school_user_session";
const DEVICE_SESSION_KEY = "school_device_session";

export type UserSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    organizationId: string;
  };
};

export type DeviceSession = {
  accessToken: string;
  deviceToken: string;
  deviceId: string;
  installationId: string;
  organizationId: string;
  branchId: string | null;
  classroomId: string | null;
  role: string;
};

export type SchoolNotice = {
  id: string;
  organizationId: string;
  typeId: string | null;
  title: string;
  description: string;
  priority: "NORMAL" | "HIGH" | "EMERGENCY";
  targetType: "ORGANIZATION" | "BRANCH" | "CLASSROOM" | "DEVICE";
  targetBranchId: string | null;
  targetClassroomId: string | null;
  targetDeviceId: string | null;
  revision: number;
  createdAt: string;
  expiresAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  expired: boolean;
  acknowledgedAt: string | null;
  metadata: Record<string, unknown> | null;
  recipientCount?: number;
  acknowledgedCount?: number;
};

export type DeviceRow = {
  id: string;
  label: string;
  device_type: string;
  branch_id: string | null;
  classroom_id: string | null;
  branch_name: string | null;
  classroom_name: string | null;
  status: "ONLINE" | "RECENTLY_ONLINE" | "OFFLINE";
  last_seen_at: string | null;
  app_version: string | null;
  enabled: boolean;
};

type Envelope<T> = { data: T; requestId?: string };
type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown };
  requestId?: string;
};

export class SchoolApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown | null): void {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(value));
}

export const schoolApi = {
  baseUrl: API_BASE,
  isConfigured: Boolean(import.meta.env.VITE_SCHOOL_API_URL),
  getUserSession: () => read<UserSession>(USER_SESSION_KEY),
  setUserSession: (session: UserSession | null) => write(USER_SESSION_KEY, session),
  getDeviceSession: () => read<DeviceSession>(DEVICE_SESSION_KEY),
  setDeviceSession: (session: DeviceSession | null) => write(DEVICE_SESSION_KEY, session),
  async request<T>(
    path: string,
    init: RequestInit = {},
    accessToken?: string,
    retried = false,
  ): Promise<T> {
    const token = accessToken ?? schoolApi.getUserSession()?.accessToken;
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => ({}))) as Envelope<T> & ErrorEnvelope;
    if (response.status === 401 && !accessToken && !retried) {
      const session = schoolApi.getUserSession();
      if (session?.refreshToken) {
        try {
          const refreshed = await schoolApi.request<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
          }>(
            "/api/v1/auth/refresh",
            { method: "POST", body: JSON.stringify({ refreshToken: session.refreshToken }) },
            undefined,
            true,
          );
          schoolApi.setUserSession({ ...session, ...refreshed });
          return schoolApi.request<T>(path, init, refreshed.accessToken, true);
        } catch {
          schoolApi.setUserSession(null);
        }
      }
    }
    if (!response.ok)
      throw new SchoolApiError(
        payload.error?.message ?? "Request failed",
        response.status,
        payload.error?.code,
        payload.error?.details,
      );
    return ("data" in payload ? payload.data : payload) as T;
  },
  async login(email: string, password: string) {
    const session = await schoolApi.request<UserSession>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    schoolApi.setUserSession(session);
    return session;
  },
  async logout() {
    const session = schoolApi.getUserSession();
    if (session?.refreshToken)
      await schoolApi
        .request(
          "/api/v1/auth/logout",
          { method: "POST", body: JSON.stringify({ refreshToken: session.refreshToken }) },
          session.accessToken,
        )
        .catch(() => undefined);
    schoolApi.setUserSession(null);
  },
  me: () => schoolApi.request<UserSession["user"]>("/api/v1/auth/me"),
  organization: (id: string) =>
    schoolApi.request<Record<string, unknown>>(`/api/v1/admin/organizations/${id}`),
  branches: () => schoolApi.request<Record<string, unknown>[]>("/api/v1/admin/branches"),
  classrooms: () => schoolApi.request<Record<string, unknown>[]>("/api/v1/admin/classrooms"),
  devices: () => schoolApi.request<DeviceRow[]>("/api/v1/admin/devices"),
  noticeTypes: () => schoolApi.request<Record<string, unknown>[]>("/api/v1/admin/notice-types"),
  notices: () =>
    schoolApi.request<{ notices: SchoolNotice[]; hasMore: boolean }>("/api/v1/notices?limit=50"),
  diagnostics: () => schoolApi.request<Record<string, unknown>>("/api/v1/admin/diagnostics"),
  deliveryEvents: () =>
    schoolApi.request<Record<string, unknown>[]>("/api/v1/admin/delivery-events"),
  createNotice: (input: Record<string, unknown>) =>
    schoolApi.request<{ notice: SchoolNotice; revision: number; recipientCount: number }>(
      "/api/v1/notices",
      { method: "POST", body: JSON.stringify(input) },
    ),
  retractNotice: (noticeId: string) =>
    schoolApi.request<Record<string, unknown>>(`/api/v1/notices/${noticeId}/retract`, {
      method: "POST",
      body: "{}",
    }),
  registerDevice: (input: Record<string, unknown>) =>
    schoolApi.request<DeviceSession>("/api/v1/devices/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deviceConfig: (token: string) =>
    schoolApi.request<Record<string, unknown>>("/api/v1/devices/me/config", {}, token),
  sync: (token: string, after: number) =>
    schoolApi.request<{
      notices: SchoolNotice[];
      latestRevision: number;
      hasMore: boolean;
      nextAfter: number;
    }>(`/api/v1/sync?after=${after}&limit=100`, {}, token),
  acknowledge: (token: string, noticeId: string) =>
    schoolApi.request<Record<string, unknown>>(
      `/api/v1/notices/${noticeId}/acknowledge`,
      { method: "POST", body: JSON.stringify({ acknowledgedAt: Date.now() }) },
      token,
    ),
};
