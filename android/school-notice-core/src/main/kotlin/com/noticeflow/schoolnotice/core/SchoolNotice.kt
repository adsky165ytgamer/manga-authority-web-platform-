package com.noticeflow.schoolnotice.core

import android.content.Context
import android.provider.Settings
import android.os.Build
import androidx.room.withTransaction
import com.noticeflow.schoolnotice.core.database.*
import com.noticeflow.schoolnotice.core.internal.*
import com.noticeflow.schoolnotice.core.model.*
import com.noticeflow.schoolnotice.core.network.SchoolNoticeApi
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.math.min
import kotlin.random.Random

object SchoolNotice {
    @Volatile private var client: SchoolNoticeClient? = null

    fun initialize(context: Context, configuration: SchoolNoticeConfiguration): SchoolNoticeClient = synchronized(this) {
        client?.close()
        SchoolNoticeClient(context.applicationContext, configuration).also { client = it }
    }

    fun client(): SchoolNoticeClient = checkNotNull(client) { "Call SchoolNotice.initialize before accessing the framework." }
    fun close() = synchronized(this) { client?.close(); client = null }
}

class SchoolNoticeClient internal constructor(context: Context, val configuration: SchoolNoticeConfiguration) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val store = SecureCredentialStore(context)
    private val logger = CoreLogger(configuration.loggingEnabled)
    private val database = SchoolNoticeDatabase.create(context)
    private val api = SchoolNoticeApi(configuration, store)
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    private val mutableEvents = MutableSharedFlow<SchoolNoticeEvent>(extraBufferCapacity = 64)

    val events: SharedFlow<SchoolNoticeEvent> = mutableEvents.asSharedFlow()
    val network = NetworkMonitor(context)
    val auth = AuthenticationRepository(api, store, json, mutableEvents)
    val device = DeviceRepository(context, api, store, database, json, configuration, mutableEvents)
    val notices = NoticeRepository(database, json, mutableEvents)
    val acknowledgements = AcknowledgementRepository(api, database, mutableEvents)
    val sync = SyncCoordinator(api, database, notices, acknowledgements, mutableEvents, logger)
    val realtime = RealtimeCoordinator(api, store, configuration, sync, mutableEvents, logger)
    val sender = SenderRepository(api)
    val diagnostics = DiagnosticsRepository(database, store, network, configuration)

    fun startReceiverRuntime(): Job = scope.launch {
        device.refreshConfiguration()
        sync.syncUntilCurrent()
        acknowledgements.replay()
        if (configuration.enableRealtime) realtime.start(this)
    }

    fun stopReceiverRuntime() = realtime.stop()
    fun refreshNetwork() = network.refresh().also { mutableEvents.tryEmit(SchoolNoticeEvent.NetworkChanged(it)) }
    fun close() { realtime.stop(); api.close(); scope.cancel() }
}

class AuthenticationRepository internal constructor(
    private val api: SchoolNoticeApi,
    private val store: SecureCredentialStore,
    private val json: Json,
    private val events: MutableSharedFlow<SchoolNoticeEvent>,
) {
    private val mutableState = MutableStateFlow<AuthState>(storedState())
    val authState: StateFlow<AuthState> = mutableState.asStateFlow()

    suspend fun login(email: String, password: String): SchoolNoticeResult<SchoolUser> {
        mutableState.value = AuthState.Authenticating
        return when (val result = api.login(email, password)) {
            is SchoolNoticeResult.Success -> {
                val payload = result.value
                store.saveUser(payload.accessToken, payload.refreshToken, json.encodeToString(payload.user))
                mutableState.value = AuthState.Authenticated(payload.user)
                SchoolNoticeResult.Success(payload.user, result.requestId)
            }
            is SchoolNoticeResult.Failure -> result.also { mutableState.value = AuthState.Error(it.error) }
        }
    }

    suspend fun restore(): SchoolNoticeResult<SchoolUser?> {
        if (store.userRefreshToken() == null) return SchoolNoticeResult.Success(null)
        mutableState.value = AuthState.Refreshing
        return when (val refreshed = api.refresh(store.userRefreshToken()!!)) {
            is SchoolNoticeResult.Success -> {
                val cachedUser = store.userJson()?.let { runCatching { json.decodeFromString<SchoolUser>(it) }.getOrNull() }
                store.saveUser(refreshed.value.accessToken, refreshed.value.refreshToken, store.userJson())
                mutableState.value = AuthState.Authenticated(cachedUser)
                SchoolNoticeResult.Success(cachedUser)
            }
            is SchoolNoticeResult.Failure -> { store.clearUser(); mutableState.value = AuthState.Expired; SchoolNoticeResult.Failure(refreshed.error) }
        }
    }

    suspend fun logout() { api.logout(store.userRefreshToken()); store.clearUser(); mutableState.value = AuthState.Unauthenticated }

    private fun storedState(): AuthState = store.userJson()?.let { runCatching { json.decodeFromString<SchoolUser>(it) }.getOrNull() }?.let(AuthState::Authenticated) ?: AuthState.Unauthenticated
}

class DeviceRepository internal constructor(
    private val context: Context,
    private val api: SchoolNoticeApi,
    private val store: SecureCredentialStore,
    private val database: SchoolNoticeDatabase,
    private val json: Json,
    private val configuration: SchoolNoticeConfiguration,
    private val events: MutableSharedFlow<SchoolNoticeEvent>,
) {
    val configurationFlow: Flow<DeviceConfig?> = database.configuration().observe().map { entity -> entity?.let { json.decodeFromString<DeviceConfig>(it.configurationJson) } }

    suspend fun enroll(type: DeviceType, label: String, organizationId: String?, enrollmentSecret: String?): SchoolNoticeResult<DeviceRegistration> {
        val request = DeviceRegistrationRequest(
            deviceInstallationId = store.installationId(), deviceType = type.name, label = label, organizationId = organizationId,
            enrollmentSecret = enrollmentSecret, manufacturer = Build.MANUFACTURER, model = Build.MODEL, androidVersion = Build.VERSION.RELEASE,
            appVersion = appVersion(), frameworkVersion = configuration.frameworkVersion, capabilities = runtimeCapabilities(context),
        )
        return when (val result = api.register(request)) {
            is SchoolNoticeResult.Success -> { store.saveDevice(result.value.deviceId, result.value.deviceToken, result.value.accessToken); events.tryEmit(SchoolNoticeEvent.DeviceEnrolled(result.value.deviceId)); result }
            is SchoolNoticeResult.Failure -> result
        }
    }

    suspend fun refreshConfiguration(): SchoolNoticeResult<DeviceConfig> = when (val result = api.config()) {
        is SchoolNoticeResult.Success -> {
            database.configuration().save(DeviceConfigurationEntity(configurationJson = json.encodeToString(result.value), version = result.value.configurationVersion, updatedAt = System.currentTimeMillis()))
            events.tryEmit(SchoolNoticeEvent.ConfigurationChanged)
            result
        }
        is SchoolNoticeResult.Failure -> result
    }

    suspend fun heartbeat(batteryLevel: Double? = null, charging: Boolean? = null): SchoolNoticeResult<HeartbeatReceipt> = api.heartbeat(
        HeartbeatRequest(timestamp = System.currentTimeMillis(), networkType = "ANDROID", batteryLevel = batteryLevel, isCharging = charging, appVersion = appVersion(), frameworkVersion = configuration.frameworkVersion)
    )

    private fun appVersion(): String = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown" }.getOrDefault("unknown")
}

class NoticeRepository internal constructor(private val database: SchoolNoticeDatabase, private val json: Json, private val events: MutableSharedFlow<SchoolNoticeEvent>) {
    fun observeActiveNotices(): Flow<List<Notice>> = database.notices().observeActive(java.time.Instant.now().toString()).map { entities -> entities.map { json.decodeFromString<Notice>(it.noticeJson) } }
    fun observeNotice(id: String): Flow<Notice?> = database.notices().observeById(id).map { it?.let { entity -> json.decodeFromString(entity.noticeJson) } }
    suspend fun markDisplayed(id: String) { database.notices().updateLifecycle(id, NoticeLifecycle.DISPLAYED.name, System.currentTimeMillis()); events.emit(SchoolNoticeEvent.NoticeDisplayed(id)) }
    suspend fun persist(notice: Notice) {
        val lifecycle = when { notice.isDeleted -> NoticeLifecycle.RETRACTED; notice.expired -> NoticeLifecycle.EXPIRED; notice.acknowledgedAt != null -> NoticeLifecycle.ACKNOWLEDGED; else -> NoticeLifecycle.PERSISTED }
        database.notices().upsert(NoticeEntity(notice.id, notice.revision, notice.title, notice.description, notice.priority, notice.createdAt, notice.expiresAt, notice.isDeleted, lifecycle.name, json.encodeToString(notice), System.currentTimeMillis()))
        events.emit(if (notice.isDeleted) SchoolNoticeEvent.NoticeRetracted(notice.id) else SchoolNoticeEvent.NoticeReceived(notice.id))
    }
}

class AcknowledgementRepository internal constructor(private val api: SchoolNoticeApi, private val database: SchoolNoticeDatabase, private val events: MutableSharedFlow<SchoolNoticeEvent>) {
    suspend fun acknowledge(noticeId: String, acknowledgedAt: Long = System.currentTimeMillis()) {
        database.acknowledgements().save(AcknowledgementEntity(noticeId, acknowledgedAt))
        replay()
    }
    suspend fun replay() {
        database.acknowledgements().pending().forEach { ack ->
            when (val result = api.acknowledge(ack.noticeId, ack.acknowledgedAt)) {
                is SchoolNoticeResult.Success -> { database.acknowledgements().markSynced(ack.noticeId, result.value.serverReceivedAt); events.emit(SchoolNoticeEvent.NoticeAcknowledged(ack.noticeId)) }
                is SchoolNoticeResult.Failure -> database.acknowledgements().markFailed(ack.noticeId, result.error.toString())
            }
        }
    }
}

class SyncCoordinator internal constructor(
    private val api: SchoolNoticeApi,
    private val database: SchoolNoticeDatabase,
    private val notices: NoticeRepository,
    private val acknowledgements: AcknowledgementRepository,
    private val events: MutableSharedFlow<SchoolNoticeEvent>,
    private val logger: CoreLogger,
) {
    suspend fun syncUntilCurrent(): SchoolNoticeResult<Long> {
        var state = database.sync().state() ?: SyncStateEntity()
        events.emit(SchoolNoticeEvent.SyncStarted(state.lastProcessedRevision))
        do {
            when (val response = api.sync(state.lastProcessedRevision)) {
                is SchoolNoticeResult.Failure -> { events.emit(SchoolNoticeEvent.SyncFailed(response.error)); return SchoolNoticeResult.Failure(response.error) }
                is SchoolNoticeResult.Success -> {
                    database.withTransaction {
                        response.value.notices.forEach { notices.persist(it) }
                        val nextRevision = response.value.nextAfter
                        database.sync().save(SyncStateEntity(lastProcessedRevision = nextRevision, serverRevision = response.value.latestRevision, lastSuccessfulSyncAt = System.currentTimeMillis()))
                        state = SyncStateEntity(lastProcessedRevision = nextRevision, serverRevision = response.value.latestRevision, lastSuccessfulSyncAt = System.currentTimeMillis())
                    }
                    logger.log("SYNC", "Persisted revision ${state.lastProcessedRevision}")
                    if (!response.value.hasMore) break
                }
            }
        } while (true)
        acknowledgements.replay()
        events.emit(SchoolNoticeEvent.SyncCompleted(state.lastProcessedRevision))
        return SchoolNoticeResult.Success(state.lastProcessedRevision)
    }
}

class RealtimeCoordinator internal constructor(
    private val api: SchoolNoticeApi,
    private val store: SecureCredentialStore,
    private val configuration: SchoolNoticeConfiguration,
    private val sync: SyncCoordinator,
    private val events: MutableSharedFlow<SchoolNoticeEvent>,
    private val logger: CoreLogger,
) {
    private var job: Job? = null
    fun start(scope: CoroutineScope) {
        if (job?.isActive == true) return
        job = scope.launch {
            var attempt = 0
            while (isActive) {
                val token = store.deviceAccessToken() ?: break
                try {
                    api.client.webSocket("${configuration.webSocketBaseUrl.trimEnd('/')}/api/v1/realtime?access_token=$token") {
                        attempt = 0; events.emit(SchoolNoticeEvent.WebSocketConnected); sync.syncUntilCurrent()
                        for (frame in incoming) if (frame is Frame.Text) { logger.log("WEBSOCKET", "Wake-up received"); sync.syncUntilCurrent() }
                    }
                } catch (_: Throwable) { events.emit(SchoolNoticeEvent.WebSocketDisconnected) }
                val delayMillis = min(60_000L, 1_000L shl min(attempt++, 6)) + Random.nextLong(0, 600)
                delay(delayMillis)
            }
        }
    }
    fun stop() { job?.cancel(); job = null }
}

class SenderRepository internal constructor(private val api: SchoolNoticeApi) {
    suspend fun create(input: NoticeInput): SchoolNoticeResult<NoticeCreated> = api.createNotice(input)
    suspend fun listNotices(limit: Int = 50): SchoolNoticeResult<NoticeList> = api.listNotices(limit)
}

data class DiagnosticsSnapshot(val installationId: String, val deviceId: String?, val backendUrl: String, val network: NetworkState, val lastRevision: Long, val pendingAcknowledgements: Int, val frameworkVersion: String)
class DiagnosticsRepository internal constructor(private val database: SchoolNoticeDatabase, private val store: SecureCredentialStore, private val network: NetworkMonitor, private val configuration: SchoolNoticeConfiguration) {
    suspend fun snapshot(): DiagnosticsSnapshot {
        val state = database.sync().state() ?: SyncStateEntity()
        return DiagnosticsSnapshot(store.installationId(), store.deviceId(), configuration.apiBaseUrl, network.refresh(), state.lastProcessedRevision, database.acknowledgements().pending().size, configuration.frameworkVersion)
    }
}

interface NoticePresentationController { suspend fun showNotice(notice: Notice); suspend fun dismissNotice(noticeId: String) }
