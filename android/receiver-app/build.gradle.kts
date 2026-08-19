plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val apiUrl = providers.gradleProperty("NOTICEFLOW_API_URL").orElse("https://noticeflow.example.invalid").get()
val wsUrl = providers.gradleProperty("NOTICEFLOW_WS_URL").orElse("wss://noticeflow.example.invalid").get()

android {
    namespace = "com.noticeflow.receiver"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.noticeflow.receiver"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        debug { buildConfigField("String", "NOTICEFLOW_API_URL", "\"$apiUrl\""); buildConfigField("String", "NOTICEFLOW_WS_URL", "\"$wsUrl\"") }
        release { isMinifyEnabled = false; buildConfigField("String", "NOTICEFLOW_API_URL", "\"$apiUrl\""); buildConfigField("String", "NOTICEFLOW_WS_URL", "\"$wsUrl\"") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":school-notice-core"))
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
}
