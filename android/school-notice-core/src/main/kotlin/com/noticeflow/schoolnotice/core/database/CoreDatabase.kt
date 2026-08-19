package com.noticeflow.schoolnotice.core.database

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.noticeflow.schoolnotice.core.model.NoticeLifecycle
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "device_configuration")
data class DeviceConfigurationEntity(@PrimaryKey val id: Int = 0, val configurationJson: String, val version: Long, val updatedAt: Long)

@Entity(tableName = "notices")
data class NoticeEntity(@PrimaryKey val id: String, val revision: Long, val title: String, val description: String, val priority: String, val createdAt: String, val expiresAt: String?, val deleted: Boolean, val lifecycle: String, val noticeJson: String, val updatedAt: Long)

@Entity(tableName = "sync_state")
data class SyncStateEntity(@PrimaryKey val key: String = "global", val lastProcessedRevision: Long = 0, val serverRevision: Long = 0, val lastSuccessfulSyncAt: Long? = null)

@Entity(tableName = "acknowledgement_queue")
data class AcknowledgementEntity(@PrimaryKey val noticeId: String, val acknowledgedAt: Long, val syncedAt: Long? = null, val attempts: Int = 0, val lastError: String? = null)

@Entity(tableName = "delivery_events")
data class DeliveryEventEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val noticeId: String?, val eventType: String, val createdAt: Long, val metadata: String? = null)

@Dao
interface NoticeDao {
    @Upsert suspend fun upsert(notice: NoticeEntity)
    @Query("select * from notices where deleted = 0 and (expiresAt is null or expiresAt > :now) order by revision desc") fun observeActive(now: String): Flow<List<NoticeEntity>>
    @Query("select * from notices where id = :id limit 1") fun observeById(id: String): Flow<NoticeEntity?>
    @Query("update notices set lifecycle = :lifecycle, updatedAt = :updatedAt where id = :id") suspend fun updateLifecycle(id: String, lifecycle: String, updatedAt: Long)
}

@Dao
interface SyncDao {
    @Query("select * from sync_state where key = 'global' limit 1") suspend fun state(): SyncStateEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(state: SyncStateEntity)
}

@Dao
interface ConfigurationDao {
    @Query("select * from device_configuration where id = 0") fun observe(): Flow<DeviceConfigurationEntity?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(entity: DeviceConfigurationEntity)
}

@Dao
interface AcknowledgementDao {
    @Upsert suspend fun save(entity: AcknowledgementEntity)
    @Query("select * from acknowledgement_queue where syncedAt is null order by acknowledgedAt asc") suspend fun pending(): List<AcknowledgementEntity>
    @Query("update acknowledgement_queue set syncedAt = :syncedAt, attempts = attempts + 1, lastError = null where noticeId = :noticeId") suspend fun markSynced(noticeId: String, syncedAt: Long)
    @Query("update acknowledgement_queue set attempts = attempts + 1, lastError = :error where noticeId = :noticeId") suspend fun markFailed(noticeId: String, error: String)
}

@Dao
interface EventDao { @Insert suspend fun insert(event: DeliveryEventEntity) }

@Database(entities = [DeviceConfigurationEntity::class, NoticeEntity::class, SyncStateEntity::class, AcknowledgementEntity::class, DeliveryEventEntity::class], version = 1, exportSchema = false)
abstract class SchoolNoticeDatabase : RoomDatabase() {
    abstract fun notices(): NoticeDao
    abstract fun sync(): SyncDao
    abstract fun configuration(): ConfigurationDao
    abstract fun acknowledgements(): AcknowledgementDao
    abstract fun events(): EventDao

    companion object {
        fun create(context: Context): SchoolNoticeDatabase = Room.databaseBuilder(context, SchoolNoticeDatabase::class.java, "school_notice.db").fallbackToDestructiveMigration().build()
    }
}
