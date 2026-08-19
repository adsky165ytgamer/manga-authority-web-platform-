package com.noticeflow.schoolnotice.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ApiEnvelope<T>(val data: T? = null, val error: ApiErrorPayload? = null, val requestId: String? = null)

@Serializable
data class ApiErrorPayload(val code: String, val message: String, val details: JsonObject? = null)

sealed interface SchoolNoticeError {
    data object NetworkUnavailable : SchoolNoticeError
    data object Unauthorized : SchoolNoticeError
    data object Forbidden : SchoolNoticeError
    data object NotFound : SchoolNoticeError
    data object ServerUnavailable : SchoolNoticeError
    data object Timeout : SchoolNoticeError
    data class InvalidResponse(val message: String) : SchoolNoticeError
    data class Server(val status: Int, val code: String?, val message: String) : SchoolNoticeError
    data class Unknown(val message: String) : SchoolNoticeError
}

sealed interface SchoolNoticeResult<out T> {
    data class Success<T>(val value: T, val requestId: String? = null) : SchoolNoticeResult<T>
    data class Failure(val error: SchoolNoticeError) : SchoolNoticeResult<Nothing>
}

enum class SchoolNoticeEnvironment { DEVELOPMENT, STAGING, PRODUCTION }

data class SchoolNoticeConfiguration(
    val apiBaseUrl: String,
    val webSocketBaseUrl: String,
    val environment: SchoolNoticeEnvironment = SchoolNoticeEnvironment.PRODUCTION,
    val enableRealtime: Boolean = true,
    val enableDiagnostics: Boolean = true,
    val requestTimeoutMillis: Long = 20_000,
    val syncIntervalMillis: Long = 60_000,
    val heartbeatIntervalMillis: Long = 120_000,
    val loggingEnabled: Boolean = false,
    val frameworkVersion: String = "1.0.0",
)

@Serializable
data class UserSession(val accessToken: String, val refreshToken: String, val expiresIn: Long, val user: SchoolUser? = null)

@Serializable
data class SchoolUser(val id: String, val name: String, val email: String, val role: String, val organizationId: String)

sealed interface AuthState {
    data object Unauthenticated : AuthState
    data object Authenticating : AuthState
    data class Authenticated(val user: SchoolUser?) : AuthState
    data object Refreshing : AuthState
    data object Expired : AuthState
    data class Error(val error: SchoolNoticeError) : AuthState
}

enum class DeviceType { RECEIVER_PHONE, RECEIVER_TV, RECEIVER_PANEL, SENDER_PHONE, ADMIN_DEVICE }

@Serializable
data class DeviceRegistrationRequest(
    val deviceInstallationId: String,
    val deviceType: String,
    val label: String,
    val organizationId: String? = null,
    val enrollmentSecret: String? = null,
    val manufacturer: String? = null,
    val model: String? = null,
    val androidVersion: String? = null,
    val appVersion: String? = null,
    val frameworkVersion: String? = null,
    val capabilities: List<String> = emptyList(),
)

@Serializable
data class DeviceRegistration(
    val deviceId: String,
    val installationId: String,
    val deviceToken: String,
    val accessToken: String,
    val enabled: Boolean,
    val organizationId: String,
    val branchId: String? = null,
    val classroomId: String? = null,
    val role: String,
)

@Serializable
data class DeviceConfig(
    val device: ConfiguredDevice,
    val organization: Organization,
    val branch: Branch? = null,
    val classroom: Classroom? = null,
    val assignment: Assignment? = null,
    val capabilities: List<Capability> = emptyList(),
    val serverTime: Long,
    val configurationVersion: Long,
)

@Serializable data class ConfiguredDevice(val id: String, val installationId: String, val type: String, val label: String, val manufacturer: String? = null, val model: String? = null, val androidVersion: String? = null, val appVersion: String? = null, val frameworkVersion: String? = null, val enabled: Boolean)
@Serializable data class Organization(val id: String, val name: String, val code: String? = null)
@Serializable data class Branch(val id: String, val name: String, val code: String? = null)
@Serializable data class Classroom(val id: String, val name: String, val code: String? = null)
@Serializable data class Assignment(val id: String, val role: String, val effectiveFrom: String? = null, val effectiveUntil: String? = null)
@Serializable data class Capability(val capability: String, val enabled: Boolean)

@Serializable data class HeartbeatRequest(val timestamp: Long? = null, val networkType: String? = null, val batteryLevel: Double? = null, val isCharging: Boolean? = null, val appVersion: String? = null, val frameworkVersion: String? = null)
@Serializable data class HeartbeatReceipt(val accepted: Boolean, val serverTime: Long)

@Serializable
data class Notice(
    val id: String,
    val organizationId: String,
    val typeId: String? = null,
    val title: String,
    val description: String,
    val priority: String,
    val targetType: String,
    val targetBranchId: String? = null,
    val targetClassroomId: String? = null,
    val targetDeviceId: String? = null,
    val revision: Long,
    val createdAt: String,
    val expiresAt: String? = null,
    val isDeleted: Boolean,
    val deletedAt: String? = null,
    val expired: Boolean,
    val acknowledgedAt: String? = null,
    val metadata: JsonObject? = null,
)

@Serializable data class NoticeInput(val typeId: String? = null, val title: String, val description: String, val priority: String = "NORMAL", val targetType: String, val targetBranchId: String? = null, val targetClassroomId: String? = null, val targetDeviceId: String? = null, val expiresAt: String? = null, val metadata: JsonObject? = null)
@Serializable data class NoticeCreated(val notice: Notice, val revision: Long, val recipientCount: Int)
@Serializable data class SyncResponse(val notices: List<Notice>, val latestRevision: Long, val hasMore: Boolean, val nextAfter: Long, val serverTime: Long)
@Serializable data class AcknowledgementReceipt(val noticeId: String, val deviceId: String, val acknowledged: Boolean, val serverReceivedAt: Long)
@Serializable data class NoticeList(val notices: List<Notice>, val hasMore: Boolean, val nextBefore: String? = null)

enum class NoticeLifecycle { RECEIVED, PERSISTED, DISPLAY_PENDING, DISPLAYED, ACKNOWLEDGED, EXPIRED, RETRACTED }
sealed interface NetworkState { data object Connected : NetworkState; data object Disconnected : NetworkState; data object ValidatedInternet : NetworkState; data object UnvalidatedNetwork : NetworkState }
sealed interface OverlayPermissionState { data object Granted : OverlayPermissionState; data object NotGranted : OverlayPermissionState; data object Unavailable : OverlayPermissionState }

sealed interface SchoolNoticeEvent {
    data class DeviceEnrolled(val deviceId: String) : SchoolNoticeEvent
    data object ConfigurationChanged : SchoolNoticeEvent
    data class SyncStarted(val afterRevision: Long) : SchoolNoticeEvent
    data class SyncCompleted(val revision: Long) : SchoolNoticeEvent
    data class SyncFailed(val error: SchoolNoticeError) : SchoolNoticeEvent
    data class NoticeReceived(val noticeId: String) : SchoolNoticeEvent
    data class NoticeDisplayed(val noticeId: String) : SchoolNoticeEvent
    data class NoticeAcknowledged(val noticeId: String) : SchoolNoticeEvent
    data class NoticeRetracted(val noticeId: String) : SchoolNoticeEvent
    data object WebSocketConnected : SchoolNoticeEvent
    data object WebSocketDisconnected : SchoolNoticeEvent
    data class NetworkChanged(val state: NetworkState) : SchoolNoticeEvent
}
