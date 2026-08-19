package com.noticeflow.sender

import android.os.Bundle
import android.text.InputType
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.NoticeInput
import com.noticeflow.schoolnotice.core.model.SchoolNoticeConfiguration
import com.noticeflow.schoolnotice.core.model.SchoolNoticeEnvironment
import com.noticeflow.schoolnotice.core.model.SchoolNoticeResult
import kotlinx.coroutines.launch

class SenderActivity : ComponentActivity() {
    private val client by lazy { SchoolNotice.initialize(applicationContext, SchoolNoticeConfiguration(BuildConfig.NOTICEFLOW_API_URL, BuildConfig.NOTICEFLOW_WS_URL, SchoolNoticeEnvironment.PRODUCTION, loggingEnabled = BuildConfig.DEBUG)) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 56, 48, 48); setBackgroundColor(0xFF06131C.toInt()) }
        fun edit(hint: String, password: Boolean = false) = EditText(this).apply { this.hint = hint; setTextColor(0xFFFFFFFF.toInt()); setHintTextColor(0xFF779497.toInt()); if (password) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD; root.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 110) }
        val status = TextView(this).apply { setTextColor(0xFFBEECE8.toInt()); textSize = 14f; text = "Sign in to send a targeted school notice."; setPadding(0, 18, 0, 18) }
        root.addView(TextView(this).apply { text = "NoticeFlow Sender"; textSize = 28f; setTextColor(0xFFFFFFFF.toInt()) }, LinearLayout.LayoutParams.MATCH_PARENT, 88)
        val email = edit("School email")
        val password = edit("Password", true)
        val login = Button(this).apply { text = "Sign in"; setOnClickListener { lifecycleScope.launch { status.text = "Authenticating…"; when (val result = client.auth.login(email.text.toString(), password.text.toString())) { is SchoolNoticeResult.Success -> status.text = "Signed in as ${result.value.name}. Compose a notice below."; is SchoolNoticeResult.Failure -> status.text = "Sign-in failed: ${result.error}" } } } }
        root.addView(login, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        root.addView(status)
        val title = edit("Notice title")
        val description = edit("Notice description")
        val targetType = edit("Target type: ORGANIZATION, BRANCH, CLASSROOM, or DEVICE").apply { setText("ORGANIZATION") }
        val targetId = edit("Target ID for branch, classroom, or device (if needed)")
        val send = Button(this).apply { text = "Send notice"; setOnClickListener { lifecycleScope.launch { val type = targetType.text.toString().uppercase(); val id = targetId.text.toString().ifBlank { null }; val input = NoticeInput(title = title.text.toString(), description = description.text.toString(), targetType = type, targetBranchId = if (type == "BRANCH") id else null, targetClassroomId = if (type == "CLASSROOM") id else null, targetDeviceId = if (type == "DEVICE") id else null); status.text = "Publishing…"; when (val result = client.sender.create(input)) { is SchoolNoticeResult.Success -> status.text = "Published revision ${result.value.revision} to ${result.value.recipientCount} matched receiver(s)."; is SchoolNoticeResult.Failure -> status.text = "Publish failed: ${result.error}" } } } }
        root.addView(send, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        setContentView(ScrollView(this).apply { addView(root) })
    }
}
