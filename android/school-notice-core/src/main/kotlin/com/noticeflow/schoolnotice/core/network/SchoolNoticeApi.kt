package com.noticeflow.schoolnotice.core.network

import com.noticeflow.schoolnotice.core.internal.SecureCredentialStore
import com.noticeflow.schoolnotice.core.model.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import java.io.IOException

internal class SchoolNoticeApi(configuration: SchoolNoticeConfiguration, private val store: SecureCredentialStore) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    val client = HttpClient(OkHttp) {
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) { requestTimeoutMillis = configuration.requestTimeoutMillis; connectTimeoutMillis = configuration.requestTimeoutMillis; socketTimeoutMillis = configuration.requestTimeoutMillis }
        defaultRequest {
            url(configuration.apiBaseUrl)
            contentType(ContentType.Application.Json)
            store.activeAccessToken()?.let { header(HttpHeaders.Authorization, "Bearer $it") }
        }
    }

    suspend fun login(email: String, password: String) = post<LoginPayload>("/api/v1/auth/login", mapOf("email" to email, "password" to password))
    suspend fun refresh(refreshToken: String) = post<RefreshPayload>("/api/v1/auth/refresh", mapOf("refreshToken" to refreshToken))
    suspend fun logout(refreshToken: String?) = post<LogoutPayload>("/api/v1/auth/logout", mapOf("refreshToken" to refreshToken))
    suspend fun me() = get<SchoolUser>("/api/v1/auth/me")
    suspend fun register(request: DeviceRegistrationRequest) = post<DeviceRegistration>("/api/v1/devices/register", request)
    suspend fun config() = get<DeviceConfig>("/api/v1/devices/me/config")
    suspend fun heartbeat(request: HeartbeatRequest) = post<HeartbeatReceipt>("/api/v1/devices/heartbeat", request)
    suspend fun sync(after: Long, limit: Int = 100) = get<SyncResponse>("/api/v1/sync?after=$after&limit=$limit")
    suspend fun acknowledge(noticeId: String, acknowledgedAt: Long) = post<AcknowledgementReceipt>("/api/v1/notices/$noticeId/acknowledge", mapOf("acknowledgedAt" to acknowledgedAt))
    suspend fun createNotice(input: NoticeInput) = post<NoticeCreated>("/api/v1/notices", input)
    suspend fun listNotices(limit: Int = 50) = get<NoticeList>("/api/v1/notices?limit=$limit")

    private suspend inline fun <reified T> get(path: String): SchoolNoticeResult<T> = request { client.get(path) }
    private suspend inline fun <reified T> post(path: String, body: Any?): SchoolNoticeResult<T> = request { client.post(path) { setBody(body) } }

    private suspend inline fun <reified T> request(call: () -> HttpResponse): SchoolNoticeResult<T> = try {
        val response = call()
        val envelope = response.body<ApiEnvelope<T>>()
        envelope.data?.let { SchoolNoticeResult.Success(it, envelope.requestId) }
            ?: SchoolNoticeResult.Failure(SchoolNoticeError.Server(response.status.value, envelope.error?.code, envelope.error?.message ?: "Request failed"))
    } catch (error: Throwable) {
        SchoolNoticeResult.Failure(error.toSchoolNoticeError())
    }

    fun close() = client.close()
}

@kotlinx.serialization.Serializable internal data class LoginPayload(val accessToken: String, val refreshToken: String, val expiresIn: Long, val user: SchoolUser)
@kotlinx.serialization.Serializable internal data class RefreshPayload(val accessToken: String, val refreshToken: String, val expiresIn: Long)
@kotlinx.serialization.Serializable internal data class LogoutPayload(val success: Boolean)

internal fun Throwable.toSchoolNoticeError(): SchoolNoticeError = when (this) {
    is IOException -> SchoolNoticeError.NetworkUnavailable
    is kotlinx.coroutines.TimeoutCancellationException -> SchoolNoticeError.Timeout
    else -> SchoolNoticeError.Unknown(message ?: "Unexpected framework error")
}
