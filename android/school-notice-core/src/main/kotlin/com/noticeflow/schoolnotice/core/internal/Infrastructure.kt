package com.noticeflow.schoolnotice.core.internal

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.noticeflow.schoolnotice.core.model.NetworkState
import com.noticeflow.schoolnotice.core.model.SchoolNoticeConfiguration
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

internal class SecureCredentialStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "school_notice_secure_store",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun installationId(): String = preferences.getString("installation_id", null)
        ?: UUID.randomUUID().toString().also { preferences.edit().putString("installation_id", it).apply() }

    fun userAccessToken(): String? = preferences.getString("user_access", null)
    fun userRefreshToken(): String? = preferences.getString("user_refresh", null)
    fun deviceAccessToken(): String? = preferences.getString("device_access", null)
    fun deviceToken(): String? = preferences.getString("device_token", null)
    fun deviceId(): String? = preferences.getString("device_id", null)
    fun userJson(): String? = preferences.getString("user_json", null)

    fun activeAccessToken(): String? = userAccessToken() ?: deviceAccessToken()
    fun saveUser(access: String, refresh: String, userJson: String?) = preferences.edit().putString("user_access", access).putString("user_refresh", refresh).putString("user_json", userJson).apply()
    fun saveDevice(deviceId: String, token: String, access: String) = preferences.edit().putString("device_id", deviceId).putString("device_token", token).putString("device_access", access).apply()
    fun clearUser() = preferences.edit().remove("user_access").remove("user_refresh").remove("user_json").apply()
    fun clearDevice() = preferences.edit().remove("device_id").remove("device_token").remove("device_access").apply()
}

internal class CoreLogger(private val enabled: Boolean) {
    fun log(category: String, message: String) {
        if (enabled) android.util.Log.d("SchoolNotice/$category", message)
    }
}

class NetworkMonitor(private val context: Context) {
    private val mutableState = MutableStateFlow(readState())
    val state: StateFlow<NetworkState> = mutableState.asStateFlow()

    fun refresh(): NetworkState = readState().also { mutableState.value = it }

    private fun readState(): NetworkState {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return NetworkState.Disconnected
        val capabilities = manager.getNetworkCapabilities(network) ?: return NetworkState.Disconnected
        return when {
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> NetworkState.ValidatedInternet
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> NetworkState.UnvalidatedNetwork
            else -> NetworkState.Connected
        }
    }
}

internal fun runtimeCapabilities(context: Context): List<String> = buildList {
    add("NETWORK")
    add("WEBSOCKET")
    add("NOTIFICATIONS")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) add("BOOT_START")
    if (context.packageManager.hasSystemFeature("android.software.leanback")) add("ANDROID_TV") else add("TOUCHSCREEN")
}
