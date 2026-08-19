package com.noticeflow.schoolnotice.core

import com.noticeflow.schoolnotice.core.model.SchoolNoticeError
import kotlin.random.Random
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryPolicyTest {
    @Test fun retries_transport_and_transient_server_errors() {
        assertTrue(RetryPolicy.shouldRetry(SchoolNoticeError.NetworkUnavailable))
        assertTrue(RetryPolicy.shouldRetry(SchoolNoticeError.Timeout))
        assertTrue(RetryPolicy.shouldRetry(SchoolNoticeError.Server(503, "UNAVAILABLE", "retry")))
        assertTrue(RetryPolicy.shouldRetry(SchoolNoticeError.Server(429, "RATE_LIMIT", "retry")))
    }

    @Test fun refuses_non_retriable_client_errors() {
        assertFalse(RetryPolicy.shouldRetry(SchoolNoticeError.Unauthorized))
        assertFalse(RetryPolicy.shouldRetry(SchoolNoticeError.Forbidden))
        assertFalse(RetryPolicy.shouldRetry(SchoolNoticeError.NotFound))
        assertFalse(RetryPolicy.shouldRetry(SchoolNoticeError.Server(400, "INVALID", "do not retry")))
    }

    @Test fun delay_is_bounded_and_grows() {
        val random = Random(42)
        assertTrue(RetryPolicy.exponentialDelayMillis(0, random) in 1_000L..1_599L)
        assertTrue(RetryPolicy.exponentialDelayMillis(6, random) in 60_000L..60_599L)
        assertTrue(RetryPolicy.exponentialDelayMillis(99, random) in 60_000L..60_599L)
    }
}
