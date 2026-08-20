package com.noticeflow.receiver

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.FirebaseResult

class NoticeSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val noticeId = inputData.getString("noticeId") ?: return Result.failure()
        return when (val result = SchoolNotice.initialize(applicationContext).receiver.processWakeUp(noticeId)) {
            is FirebaseResult.Success -> { result.value?.let { OverlayManager(applicationContext).show(it) }; Result.success() }
            is FirebaseResult.Failure -> Result.retry()
        }
    }
}
