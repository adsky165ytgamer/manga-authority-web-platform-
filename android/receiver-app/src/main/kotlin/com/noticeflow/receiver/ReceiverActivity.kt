package com.noticeflow.receiver

import android.os.Bundle
import android.provider.Settings
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.FirebaseResult
import kotlinx.coroutines.launch

class ReceiverActivity : ComponentActivity() {
    private lateinit var status: TextView
    private val client by lazy { SchoolNotice.initialize(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 56, 48, 48); setBackgroundColor(0xFF06131C.toInt()) }
        fun field(label: String, hint: String) = EditText(this).apply {
            this.hint = hint; setTextColor(0xFFE7F3F3.toInt()); setHintTextColor(0xFF779497.toInt()); setSingleLine(true)
            column.addView(TextView(this@ReceiverActivity).apply { text = label; setTextColor(0xFFBEECE8.toInt()); textSize = 12f }, LinearLayout.LayoutParams.MATCH_PARENT, 40)
            column.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 108)
        }
        column.addView(TextView(this).apply { text = "NoticeFlow Receiver"; textSize = 28f; setTextColor(0xFFFFFFFF.toInt()) }, LinearLayout.LayoutParams.MATCH_PARENT, 92)
        val displayName = field("DISPLAY LABEL", "Name this physical display")
        val enrollmentCode = field("ONE-TIME ENROLLMENT CODE", "Issued by your school administrator")
        status = TextView(this).apply { setTextColor(0xFFB8C9CB.toInt()); textSize = 14f; setPadding(0, 26, 0, 26); text = receiverStatus() }
        column.addView(status)
        column.addView(Button(this).apply { text = "Create secure receiver identity"; setOnClickListener { lifecycleScope.launch { status.text = "Creating this panel's Firebase identity…"; when (val result = client.authentication.signInAnonymously()) { is FirebaseResult.Success -> status.text = "Receiver identity is ready. Enter the live one-time enrollment code."; is FirebaseResult.Failure -> status.text = "Identity setup failed: ${result.message}" } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        column.addView(Button(this).apply { text = "Claim live enrollment"; setOnClickListener { lifecycleScope.launch { status.text = "Claiming secured enrollment…"; when (val result = client.school.claimReceiverEnrollment(displayName.text.toString(), enrollmentCode.text.toString())) { is FirebaseResult.Success -> { client.school.refreshReceiverFcmToken(); status.text = "Receiver enrolled for live data. Classroom: ${result.value.classroomId ?: "not yet assigned"}." }; is FirebaseResult.Failure -> status.text = "Enrollment failed: ${result.message}" } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        column.addView(Button(this).apply { text = "Grant overlay permission"; setOnClickListener { startActivity(android.content.Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:$packageName"))) } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        column.addView(Button(this).apply { text = "Synchronize live notices"; setOnClickListener { lifecycleScope.launch { when (val result = client.receiver.synchronize()) { is FirebaseResult.Success -> status.text = "Live sync finished. ${result.value} targeted notice(s) checked."; is FirebaseResult.Failure -> status.text = "Sync failed: ${result.message}" } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun receiverStatus() = if (Settings.canDrawOverlays(this)) "Overlay permission: granted\nCloud source: Firebase Firestore" else "Overlay permission: required\nCloud source: Firebase Firestore"
}
