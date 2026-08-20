package com.noticeflow.schoolnotice.core

import android.content.Context
import androidx.room.withTransaction
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging
import com.noticeflow.schoolnotice.core.database.AcknowledgementEntity
import com.noticeflow.schoolnotice.core.database.NoticeEntity
import com.noticeflow.schoolnotice.core.database.SchoolNoticeDatabase
import com.noticeflow.schoolnotice.core.model.*
import com.noticeflow.schoolnotice.core.model.SchoolNotice as FirestoreNotice
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID

/** Firebase is the cloud authority. Room is used solely for local receiver recovery. */
object SchoolNotice {
    @Volatile private var instance: FirebaseSchoolNoticeCore? = null
    fun initialize(context: Context): FirebaseSchoolNoticeCore = synchronized(this) {
        instance ?: FirebaseSchoolNoticeCore(context.applicationContext).also { instance = it }
    }
    fun client(): FirebaseSchoolNoticeCore = checkNotNull(instance) { "Initialize SchoolNotice before use." }
}

class FirebaseSchoolNoticeCore internal constructor(context: Context) {
    private val database = SchoolNoticeDatabase.create(context)
    private val localInstallation = LocalInstallationId(context)
    private val firestore = Firebase.firestore
    private val auth = Firebase.auth
    private val functions = FirebaseFunctions.getInstance("us-central1")

    val authentication = FirebaseAuthentication(auth)
    val school = FirebaseSchoolRepository(firestore, auth, functions, localInstallation)
    val receiver = FirebaseReceiverRuntime(firestore, auth, localInstallation, database, school)
}

class LocalInstallationId(context: Context) {
    private val preferences = context.getSharedPreferences("noticeflow_installation", Context.MODE_PRIVATE)
    fun value(): String = preferences.getString("installation_id", null)
        ?: UUID.randomUUID().toString().also { preferences.edit().putString("installation_id", it).apply() }
}

class FirebaseAuthentication(private val auth: FirebaseAuth) {
    private val mutableState = MutableStateFlow(auth.currentUser?.let { FirebaseState.SignedIn(it.uid) } ?: FirebaseState.SignedOut)
    val state: StateFlow<FirebaseState> = mutableState.asStateFlow()

    init { auth.addAuthStateListener { mutableState.value = it.currentUser?.let { user -> FirebaseState.SignedIn(user.uid) } ?: FirebaseState.SignedOut } }

    suspend fun signInWithEmail(email: String, password: String): FirebaseResult<String> = runCatching {
        mutableState.value = FirebaseState.Authenticating
        auth.signInWithEmailAndPassword(email.trim(), password).await().user?.uid ?: error("Firebase did not return a user")
    }.fold({ FirebaseResult.Success(it) }, { error -> mutableState.value = FirebaseState.Error(error.message ?: "Firebase authentication failed"); FirebaseResult.Failure(error.message ?: "Firebase authentication failed", error) })

    suspend fun signInAnonymously(): FirebaseResult<String> = runCatching {
        mutableState.value = FirebaseState.Authenticating
        auth.currentUser?.takeIf { it.isAnonymous }?.uid ?: auth.signInAnonymously().await().user?.uid ?: error("Firebase did not return an anonymous receiver identity")
    }.fold({ FirebaseResult.Success(it) }, { error -> mutableState.value = FirebaseState.Error(error.message ?: "Receiver sign-in failed"); FirebaseResult.Failure(error.message ?: "Receiver sign-in failed", error) })

    fun signOut() = auth.signOut()
}

class FirebaseSchoolRepository internal constructor(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
    private val functions: FirebaseFunctions,
    private val localInstallation: LocalInstallationId,
) {
    private fun uid(): String = checkNotNull(auth.currentUser?.uid) { "Firebase Authentication is required" }
    private suspend fun callable(name: String, payload: Map<String, Any?>): Map<*, *> {
        val result = functions.getHttpsCallable(name).call(payload).await().data
        return result as? Map<*, *> ?: error("$name returned an invalid response")
    }

    fun installationId(): String = localInstallation.value()

    suspend fun activeInstallation(): SchoolInstallation? = firestore.collection("installations").document(localInstallation.value()).get().await().toInstallation()

    suspend fun activeIdentity(): SchoolIdentity? = firestore.collection("users").document(uid()).get().await().toIdentity()

    suspend fun registerSenderInstallation(displayName: String): FirebaseResult<SchoolInstallation> = runCatching {
        require(displayName.trim().isNotEmpty()) { "Name this sender device before registering it" }
        callable("registerSenderInstallation", mapOf("installationId" to localInstallation.value(), "displayName" to displayName.trim()))
        activeInstallation() ?: error("Sender installation was not returned by Firestore")
    }.fold({ FirebaseResult.Success(it) }, { FirebaseResult.Failure(it.message ?: "Sender registration failed", it) })

    suspend fun claimReceiverEnrollment(displayName: String, enrollmentCode: String): FirebaseResult<ReceiverConfiguration> = runCatching {
        require(displayName.trim().isNotEmpty()) { "Name this physical display before claiming enrollment" }
        require(enrollmentCode.trim().isNotEmpty()) { "A one-time enrollment code is required" }
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
        callable("claimReceiverEnrollment", mapOf("installationId" to localInstallation.value(), "displayName" to displayName.trim(), "code" to enrollmentCode.trim(), "fcmToken" to token))
        configuration() ?: error("Receiver configuration was not returned by Firestore")
    }.fold({ FirebaseResult.Success(it) }, { FirebaseResult.Failure(it.message ?: "Receiver enrollment failed", it) })

    suspend fun refreshReceiverFcmToken(): FirebaseResult<Unit> = runCatching {
        val token = FirebaseMessaging.getInstance().token.await()
        callable("refreshReceiverFcmToken", mapOf("installationId" to localInstallation.value(), "fcmToken" to token))
        Unit
    }.fold({ FirebaseResult.Success(Unit) }, { FirebaseResult.Failure(it.message ?: "FCM token refresh failed", it) })

    suspend fun configuration(): ReceiverConfiguration? {
        val profile = firestore.collection("receiverProfiles").document(uid()).get().await()
        if (!profile.exists() || profile.getBoolean("enabled") != true) return null
        val organizationId = profile.getString("organizationId") ?: return null
        val installationId = profile.getString("installationId") ?: return null
        val installation = firestore.collection("installations").document(installationId).get().await()
        return ReceiverConfiguration(installationId, organizationId, profile.getString("classroomId"), installation.getString("displayName") ?: "", installation.getBoolean("enabled") ?: false)
    }

    fun observeClassrooms(organizationId: String) = callbackFlow {
        val listener = firestore.collection("classrooms").whereEqualTo("organizationId", organizationId).whereEqualTo("enabled", true).orderBy("displayName").addSnapshotListener { snapshot, error ->
            if (error != null) { close(error); return@addSnapshotListener }
            trySend(snapshot?.documents?.mapNotNull { it.toClassroom() } ?: emptyList())
        }
        awaitClose { listener.remove() }
    }

    fun observeTeacherNotices() = callbackFlow {
        val listener = firestore.collection("notices").whereEqualTo("createdByAuthUid", uid()).orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener { snapshot, error ->
            if (error != null) { close(error); return@addSnapshotListener }
            trySend(snapshot?.documents?.mapNotNull { it.toNotice() } ?: emptyList())
        }
        awaitClose { listener.remove() }
    }

    suspend fun publishNotice(title: String, description: String, type: NoticeType, classroomId: String): FirebaseResult<String> = runCatching {
        val result = callable("publishNotice", mapOf("installationId" to localInstallation.value(), "title" to title.trim(), "description" to description.trim(), "type" to type.name, "classroomId" to classroomId, "expiresAt" to null))
        result["noticeId"] as? String ?: error("Notice publishing returned no ID")
    }.fold({ FirebaseResult.Success(it) }, { FirebaseResult.Failure(it.message ?: "Notice publishing failed", it) })
}

class FirebaseReceiverRuntime internal constructor(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
    private val localInstallation: LocalInstallationId,
    private val database: SchoolNoticeDatabase,
    private val school: FirebaseSchoolRepository,
) {
    suspend fun processWakeUp(noticeId: String): FirebaseResult<FirestoreNotice?> = runCatching {
        val config = school.configuration() ?: error("Receiver has not completed enrollment")
        val notice = firestore.collection("notices").document(noticeId).get().await().toNotice()
        if (notice == null || !targets(config, notice) || notice.status != NoticeStatus.PUBLISHED) null else notice.also { persist(it) }
    }.fold({ FirebaseResult.Success(it) }, { FirebaseResult.Failure(it.message ?: "Notice retrieval failed", it) })

    suspend fun synchronize(): FirebaseResult<Int> = runCatching {
        val config = school.configuration() ?: error("Receiver has not completed enrollment")
        val classroom = config.classroomId ?: return@runCatching 0
        val records = firestore.collection("notices").whereEqualTo("organizationId", config.organizationId).whereEqualTo("targetType", "CLASSROOM").whereEqualTo("targetId", classroom).whereEqualTo("status", NoticeStatus.PUBLISHED.name).get().await().documents.mapNotNull { it.toNotice() }
        records.forEach { persist(it) }
        replayAcknowledgements()
        records.size
    }.fold({ FirebaseResult.Success(it) }, { FirebaseResult.Failure(it.message ?: "Receiver synchronization failed", it) })

    suspend fun acknowledge(noticeId: String) {
        database.acknowledgements().save(AcknowledgementEntity(noticeId, System.currentTimeMillis()))
        database.notices().updateLifecycle(noticeId, "ACKNOWLEDGED", System.currentTimeMillis())
        replayAcknowledgements()
    }

    suspend fun replayAcknowledgements() {
        val config = school.configuration() ?: return
        val uid = checkNotNull(auth.currentUser?.uid)
        database.acknowledgements().pending().forEach { acknowledgement ->
            runCatching {
                firestore.collection("acknowledgements").document("${acknowledgement.noticeId}_${config.installationId}").set(mapOf("noticeId" to acknowledgement.noticeId, "installationId" to config.installationId, "authUid" to uid, "organizationId" to config.organizationId, "classroomId" to config.classroomId, "acknowledgedAt" to FieldValue.serverTimestamp(), "createdAt" to FieldValue.serverTimestamp())).await()
                database.acknowledgements().markSynced(acknowledgement.noticeId, System.currentTimeMillis())
            }.onFailure { database.acknowledgements().markFailed(acknowledgement.noticeId, it.message ?: "Acknowledgement synchronization failed") }
        }
    }

    private suspend fun persist(notice: FirestoreNotice) = database.withTransaction {
        val stored = SerializableNotice(notice.id, notice.organizationId, notice.createdByIdentityId, notice.createdByInstallationId, notice.title, notice.description, notice.type.name, notice.targetType, notice.targetId, notice.status.name, notice.createdAt?.seconds, notice.expiresAt?.seconds)
        val json = kotlinx.serialization.json.Json.encodeToString(SerializableNotice.serializer(), stored)
        database.notices().upsert(NoticeEntity(notice.id, notice.createdAt?.seconds ?: 0L, notice.title, notice.description, notice.type.name, notice.createdAt?.toDate()?.toInstant()?.toString() ?: "", notice.expiresAt?.toDate()?.toInstant()?.toString(), false, "PERSISTED", json, System.currentTimeMillis()))
    }

    private fun targets(config: ReceiverConfiguration, notice: FirestoreNotice) = notice.organizationId == config.organizationId && notice.targetType == "CLASSROOM" && notice.targetId == config.classroomId
}

@kotlinx.serialization.Serializable private data class SerializableNotice(val id: String, val organizationId: String, val createdByIdentityId: String, val createdByInstallationId: String, val title: String, val description: String, val type: String, val targetType: String, val targetId: String, val status: String, val createdAtSeconds: Long?, val expiresAtSeconds: Long?)

private fun DocumentSnapshot.toInstallation(): SchoolInstallation? = takeIf { exists() }?.let {
    val type = runCatching { InstallationType.valueOf(getString("installationType") ?: "") }.getOrNull() ?: return null
    val authUid = getString("authUid") ?: return null
    SchoolInstallation(id, authUid, type, getString("identityId"), getString("organizationId"), getString("classroomId"), getString("displayName"), getBoolean("enabled") ?: false, getString("fcmToken"))
}

private fun DocumentSnapshot.toIdentity(): SchoolIdentity? = takeIf { exists() }?.let {
    val type = runCatching { IdentityType.valueOf(getString("role") ?: "") }.getOrNull() ?: return null
    SchoolIdentity(id, type, getString("displayName") ?: return null, id, "", getBoolean("enabled") ?: false)
}

private fun DocumentSnapshot.toClassroom(): Classroom? = takeIf { exists() }?.let { Classroom(id, getString("organizationId") ?: return null, getString("displayName") ?: return null, getBoolean("enabled") ?: false) }

private fun DocumentSnapshot.toNotice(): FirestoreNotice? = takeIf { exists() }?.let {
    val type = runCatching { NoticeType.valueOf(getString("type") ?: "") }.getOrNull() ?: return null
    val status = runCatching { NoticeStatus.valueOf(getString("status") ?: "") }.getOrNull() ?: return null
    FirestoreNotice(id, getString("organizationId") ?: return null, getString("createdByAuthUid") ?: return null, getString("createdByInstallationId") ?: return null, getString("title") ?: return null, getString("description") ?: return null, type, getString("targetType") ?: return null, getString("targetId") ?: return null, status, getTimestamp("createdAt"), getTimestamp("expiresAt"))
}
