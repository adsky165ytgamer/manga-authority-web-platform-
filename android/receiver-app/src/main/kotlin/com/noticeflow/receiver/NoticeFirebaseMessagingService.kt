package com.noticeflow.receiver

import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.noticeflow.schoolnotice.core.SchoolNotice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NoticeFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        CoroutineScope(Dispatchers.IO).launch { SchoolNotice.initialize(applicationContext).school.refreshReceiverFcmToken() }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val noticeId = message.data["noticeId"] ?: return
        val request = OneTimeWorkRequestBuilder<NoticeSyncWorker>().setInputData(workDataOf("noticeId" to noticeId)).build()
        WorkManager.getInstance(applicationContext).enqueueUniqueWork("notice-$noticeId", ExistingWorkPolicy.KEEP, request)
    }
}
