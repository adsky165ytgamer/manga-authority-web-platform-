package com.noticeflow.schoolnotice.core

import com.noticeflow.schoolnotice.core.model.SchoolNoticeError
import kotlin.math.min
import kotlin.random.Random

object RetryPolicy {
    fun shouldRetry(error: SchoolNoticeError): Boolean = when (error) {
        SchoolNoticeError.NetworkUnavailable, SchoolNoticeError.ServerUnavailable, SchoolNoticeError.Timeout -> true
        is SchoolNoticeError.Server -> error.status == 429 || error.status >= 500
        else -> false
    }

    fun exponentialDelayMillis(attempt: Int, random: Random = Random.Default): Long {
        val cappedAttempt = attempt.coerceIn(0, 6)
        return min(60_000L, 1_000L shl cappedAttempt) + random.nextLong(0, 600)
    }
}
