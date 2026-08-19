package com.noticeflow.receiver

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.DeviceType
import com.noticeflow.schoolnotice.core.model.SchoolNoticeConfiguration
import com.noticeflow.schoolnotice.core.model.SchoolNoticeEnvironment
import com.noticeflow.schoolnotice.core.model.SchoolNoticeResult
import kotlinx.coroutines.launch

class ReceiverActivity : ComponentActivity() {
    private lateinit var status: TextView
    private val client by lazy { SchoolNotice.initialize(applicationContext, configuration()) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 56, 48, 48); setBackgroundColor(0xFF06131C.toInt()) }
        fun field(label: String, hint: String): EditText = EditText(this).apply { this.hint = hint; setTextColor(0xFFE7F3F3.toInt()); setHintTextColor(0xFF779497.toInt()); setSingleLine(true); column.addView(TextView(this@ReceiverActivity).apply { text = label; setTextColor(0xFFBEECE8.toInt()); textSize = 12f }, LinearLayout.LayoutParams.MATCH_PARENT, 40); column.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 108) }
        column.addView(TextView(this).apply { text = "NoticeFlow Receiver"; textSize = 28f; setTextColor(0xFFFFFFFF.toInt()) }, LinearLayout.LayoutParams.MATCH_PARENT, 92)
        val label = field("DISPLAY LABEL", "e.g. 9A Display")
        val organization = field("ORGANIZATION ID", "UUID supplied by an administrator")
        val enrollment = field("ENROLLMENT SECRET", "One-time school enrollment secret").apply { inputType = 0x81 }
        status = TextView(this).apply { setTextColor(0xFFB8C9CB.toInt()); textSize = 14f; setPadding(0, 26, 0, 26); text = receiverStatus() }
        column.addView(status)
        val enroll = Button(this).apply {
            text = "Enroll receiver and start runtime"
            setOnClickListener {
                lifecycleScope.launch {
                    status.text = "Enrolling securely…"
                    when (val result = client.device.enroll(DeviceType.RECEIVER_PANEL, label.text.toString().ifBlank { "School Display" }, organization.text.toString().ifBlank { null }, enrollment.text.toString().ifBlank { null })) {
                        is SchoolNoticeResult.Success -> { status.text = "Enrolled. Device ${result.value.deviceId.take(8)}… is ready to sync."; ReceiverForegroundService.start(this@ReceiverActivity) }
                        is SchoolNoticeResult.Failure -> status.text = "Enrollment failed: ${result.error}"
                    }
                }
            }
        }
        column.addView(enroll, LinearLayout.LayoutParams.MATCH_PARENT, 124)
        val overlay = Button(this).apply { text = "Grant overlay permission"; setOnClickListener { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) } }
        column.addView(overlay, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        val diagnostics = Button(this).apply { text = "Refresh diagnostics"; setOnClickListener { lifecycleScope.launch { val data = client.diagnostics.snapshot(); status.text = "Network: ${data.network}\nLast revision: ${data.lastRevision}\nPending acknowledgements: ${data.pendingAcknowledgements}" } } }
        column.addView(diagnostics, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        setContentView(ScrollView(this).apply { addView(column); foregroundGravity = Gravity.TOP })
    }

    private fun configuration() = SchoolNoticeConfiguration(apiBaseUrl = BuildConfig.NOTICEFLOW_API_URL, webSocketBaseUrl = BuildConfig.NOTICEFLOW_WS_URL, environment = SchoolNoticeEnvironment.PRODUCTION, loggingEnabled = BuildConfig.DEBUG)
    private fun receiverStatus() = if (Settings.canDrawOverlays(this)) "Overlay permission: granted\nRuntime: not started" else "Overlay permission: required\nRuntime: not started"
}
