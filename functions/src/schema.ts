import { z } from "zod";

export const nonEmpty = z.string().trim().min(1).max(160);
export const organizationInput = z.object({ displayName: nonEmpty });
export const classroomInput = z.object({ displayName: nonEmpty });
export const provisionTeacherInput = z.object({ uid: z.string().min(1).max(128), displayName: nonEmpty });
export const enrollmentCodeInput = z.object({ classroomId: z.string().min(1).max(128).nullable().optional(), expiresInMinutes: z.number().int().min(5).max(1_440).default(60) });
export const claimEnrollmentInput = z.object({ code: z.string().min(20).max(256), installationId: z.string().uuid(), displayName: nonEmpty, fcmToken: z.string().min(32).max(16_384).nullable().optional() });
export const registerSenderInstallationInput = z.object({ installationId: z.string().uuid(), displayName: nonEmpty });
export const refreshReceiverFcmTokenInput = z.object({ installationId: z.string().uuid(), fcmToken: z.string().min(32).max(16_384) });
export const publishNoticeInput = z.object({ installationId: z.string().uuid(), classroomId: z.string().min(1).max(128), title: z.string().trim().min(1).max(140), description: z.string().trim().min(1).max(5_000), type: z.enum(["HOMEWORK", "IMPORTANT", "INFORMATION"]), expiresAt: z.string().datetime().nullable().optional() });
export const assignReceiverInput = z.object({ installationId: z.string().uuid(), classroomId: z.string().min(1).max(128).nullable() });
export const retractNoticeInput = z.object({ noticeId: z.string().min(1).max(128) });
export const bootstrapFirstAdminInput = z.object({ organizationDisplayName: nonEmpty, administratorDisplayName: nonEmpty });

export type NoticeStatus = "PUBLISHED" | "RETRACTED" | "EXPIRED";
