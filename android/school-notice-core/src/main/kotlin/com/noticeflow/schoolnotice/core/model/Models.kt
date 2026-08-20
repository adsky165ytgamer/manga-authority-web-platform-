package com.noticeflow.schoolnotice.core.model

import com.google.firebase.Timestamp

enum class InstallationType { SENDER, RECEIVER }
enum class IdentityType { TEACHER, RECEIVER, ADMIN }
enum class NoticeType { HOMEWORK, IMPORTANT, INFORMATION }
enum class NoticeStatus { PUBLISHED, ACKNOWLEDGED, EXPIRED, RETRACTED }

data class SchoolIdentity(
    val id: String,
    val type: IdentityType,
    val displayName: String,
    val authUid: String,
    val installationId: String,
    val enabled: Boolean,
)

data class SchoolInstallation(
    val id: String,
    val authUid: String,
    val installationType: InstallationType,
    val identityId: String?,
    val organizationId: String?,
    val classroomId: String?,
    val displayName: String?,
    val enabled: Boolean,
    val fcmToken: String?,
)

data class Classroom(val id: String, val organizationId: String, val displayName: String, val enabled: Boolean)

data class SchoolNotice(
    val id: String,
    val organizationId: String,
    val createdByIdentityId: String,
    val createdByInstallationId: String,
    val title: String,
    val description: String,
    val type: NoticeType,
    val targetType: String,
    val targetId: String,
    val status: NoticeStatus,
    val createdAt: Timestamp?,
    val expiresAt: Timestamp?,
)

data class ReceiverConfiguration(
    val installationId: String,
    val organizationId: String,
    val classroomId: String?,
    val displayName: String,
    val enabled: Boolean,
)

sealed interface FirebaseState {
    data object SignedOut : FirebaseState
    data object Authenticating : FirebaseState
    data class SignedIn(val uid: String) : FirebaseState
    data class Error(val message: String) : FirebaseState
}

sealed interface FirebaseResult<out T> {
    data class Success<T>(val value: T) : FirebaseResult<T>
    data class Failure(val message: String, val cause: Throwable? = null) : FirebaseResult<Nothing>
}
