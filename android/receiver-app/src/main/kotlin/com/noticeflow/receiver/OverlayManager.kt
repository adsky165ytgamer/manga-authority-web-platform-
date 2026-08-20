package com.noticeflow.receiver

import android.content.Context
import android.graphics.Color
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.noticeflow.schoolnotice.core.SchoolNotice
import com.noticeflow.schoolnotice.core.model.SchoolNotice as FirestoreNotice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class OverlayManager(private val context: Context) {
    fun show(notice: FirestoreNotice) {
        if (!Settings.canDrawOverlays(context)) return
        val manager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val card = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(56, 56, 56, 56); setBackgroundColor(Color.rgb(6, 19, 28)) }
        card.addView(TextView(context).apply { text = notice.type.name; textSize = 15f; setTextColor(Color.rgb(0, 220, 202)) })
        card.addView(TextView(context).apply { text = notice.title; textSize = 30f; setTextColor(Color.WHITE); setPadding(0, 24, 0, 18) })
        card.addView(TextView(context).apply { text = notice.description; textSize = 20f; setTextColor(Color.rgb(224, 239, 240)); setPadding(0, 0, 0, 34) })
        val params = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, android.graphics.PixelFormat.TRANSLUCENT).apply { gravity = Gravity.CENTER; horizontalMargin = 0.06f; verticalMargin = 0.08f }
        card.addView(Button(context).apply { text = "DONE"; setOnClickListener { CoroutineScope(Dispatchers.IO).launch { SchoolNotice.initialize(context).receiver.acknowledge(notice.id); CoroutineScope(Dispatchers.Main).launch { runCatching { manager.removeView(card) } } } } })
        manager.addView(card, params)
    }
}
