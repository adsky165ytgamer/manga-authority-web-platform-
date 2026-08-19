package com.noticeflow.receiver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.noticeflow.schoolnotice.core.SchoolNotice
import kotlinx.coroutines.Job

class ReceiverForegroundService : Service() {
    private var runtime: Job? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel()
        startForeground(1001, NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("NoticeFlow Receiver").setContentText("Connected receiver runtime is active").setOngoing(true).build())
        runtime?.cancel(); runtime = SchoolNotice.client().startReceiverRuntime()
        return START_STICKY
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { runtime?.cancel(); SchoolNotice.client().stopReceiverRuntime(); super.onDestroy() }
    private fun createChannel() { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL, "Receiver runtime", NotificationManager.IMPORTANCE_LOW)) }
    companion object { private const val CHANNEL = "noticeflow_receiver"; fun start(context: Context) { androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, ReceiverForegroundService::class.java)) } }
}
