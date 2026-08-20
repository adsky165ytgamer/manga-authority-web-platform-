package com.noticeflow.sender

import android.os.Bundle
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.FirebaseResult
import com.noticeflow.schoolnotice.core.model.NoticeType
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class SenderActivity : ComponentActivity() {
    private val client by lazy { SchoolNotice.initialize(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 56, 48, 48); setBackgroundColor(0xFF06131C.toInt()) }
        fun edit(hint: String, password: Boolean = false) = EditText(this).apply { this.hint = hint; setTextColor(0xFFFFFFFF.toInt()); setHintTextColor(0xFF779497.toInt()); if (password) inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD; root.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 110) }
        val status = TextView(this).apply { setTextColor(0xFFBEECE8.toInt()); textSize = 14f; text = "Sign in to retrieve your real Firebase staff profile and live classrooms."; setPadding(0, 18, 0, 18) }
        root.addView(TextView(this).apply { text = "NoticeFlow Sender"; textSize = 28f; setTextColor(0xFFFFFFFF.toInt()) }, LinearLayout.LayoutParams.MATCH_PARENT, 88)
        val email = edit("School email")
        val password = edit("Password", true)
        val deviceLabel = edit("Name this sender device")
        root.addView(Button(this).apply { text = "Sign in and register sender"; setOnClickListener { lifecycleScope.launch { status.text = "Authenticating with Firebase…"; when (val result = client.authentication.signInWithEmail(email.text.toString(), password.text.toString())) { is FirebaseResult.Success -> when (val registration = client.school.registerSenderInstallation(deviceLabel.text.toString())) { is FirebaseResult.Success -> status.text = "Sender is registered to ${registration.value.organizationId}. Load the live classrooms."; is FirebaseResult.Failure -> status.text = "Registration failed: ${registration.message}" }; is FirebaseResult.Failure -> status.text = "Sign-in failed: ${result.message}" } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        root.addView(status)
        val title = edit("Notice title")
        val description = edit("Notice description")
        val type = Spinner(this).apply { adapter = ArrayAdapter(this@SenderActivity, android.R.layout.simple_spinner_dropdown_item, NoticeType.entries.map { it.name }); root.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 110) }
        val classrooms = Spinner(this).apply { adapter = ArrayAdapter(this@SenderActivity, android.R.layout.simple_spinner_dropdown_item, mutableListOf<String>()); root.addView(this, LinearLayout.LayoutParams.MATCH_PARENT, 110) }
        val classroomIds = mutableListOf<String>()
        root.addView(Button(this).apply { text = "Load live classrooms"; setOnClickListener { lifecycleScope.launch { val organizationId = client.school.activeInstallation()?.organizationId; if (organizationId == null) { status.text = "Sign in and register this sender first."; return@launch }; client.school.observeClassrooms(organizationId).collectLatest { rows -> classroomIds.clear(); classroomIds.addAll(rows.map { it.id }); (classrooms.adapter as ArrayAdapter<String>).apply { clear(); addAll(rows.map { it.displayName }); notifyDataSetChanged() }; status.text = "Loaded ${rows.size} live classroom(s)." } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        root.addView(Button(this).apply { text = "Send live notice"; setOnClickListener { lifecycleScope.launch { val classroomId = classroomIds.getOrNull(classrooms.selectedItemPosition); if (classroomId == null) { status.text = "Load a live classroom before sending."; return@launch }; status.text = "Publishing through the secured Firebase Function…"; when (val result = client.school.publishNotice(title.text.toString(), description.text.toString(), NoticeType.valueOf(type.selectedItem.toString()), classroomId)) { is FirebaseResult.Success -> status.text = "Notice ${result.value.take(8)}… published. Firebase will wake matching live panels."; is FirebaseResult.Failure -> status.text = "Publish failed: ${result.message}" } } } }, LinearLayout.LayoutParams.MATCH_PARENT, 112)
        setContentView(ScrollView(this).apply { addView(root) })
    }
}
