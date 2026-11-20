package io.github.windusth.wish

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.ColorUtils
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val transparent = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    enableEdgeToEdge(statusBarStyle = transparent, navigationBarStyle = transparent)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    val handled = WindowInsetsCompat.Type.systemBars() or
      WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val safe = windowInsets.getInsets(handled)
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      // The WebView now occupies the safe rectangle, including when the keyboard is open.
      WindowInsetsCompat.Builder(windowInsets)
        .setDisplayCutout(null)
        .setInsets(handled, Insets.NONE)
        .build()
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(
      webView, "wishSystemBars", setOf("http://tauri.localhost", "https://tauri.localhost")
    ) { _, message, _, mainFrame, _ ->
      if (!mainFrame) return@addWebMessageListener
      val hex = message.data ?: return@addWebMessageListener
      if (!hex.matches(Regex("#[0-9a-fA-F]{6}"))) return@addWebMessageListener
      val color = Color.parseColor(hex)
      findViewById<View>(android.R.id.content).setBackgroundColor(color)
      val bars = WindowCompat.getInsetsController(window, window.decorView)
      val light = ColorUtils.calculateLuminance(color) > 0.5
      bars.isAppearanceLightStatusBars = light
      bars.isAppearanceLightNavigationBars = light
    }
  }
}
