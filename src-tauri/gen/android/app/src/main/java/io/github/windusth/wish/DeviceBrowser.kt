package io.github.windusth.wish

import android.app.Activity
import android.graphics.Outline
import android.net.Uri
import android.view.View
import android.view.ViewOutlineProvider
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import android.view.Gravity
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.math.roundToInt

// The message listener belongs only to the packaged Wish WebView. The guest
// has no native bridge and never receives Wish connection details.
class DeviceBrowser(private val activity: Activity, private val host: WebView) {
  private var guest: WebView? = null
  private var session = ""
  private var capturing = false
  private var cornerRadius = 0f

  private fun allowed(uri: Uri): Boolean =
    uri.scheme in listOf("https", "http") && !uri.host.isNullOrEmpty() &&
      uri.host?.trimEnd('.')?.endsWith(".localhost", ignoreCase = true) == false

  fun install() {
    WebViewCompat.addWebMessageListener(host, "wishDeviceBrowser",
      setOf("http://tauri.localhost", "https://tauri.localhost")) { _, message, _, mainFrame, reply ->
      if (!mainFrame) return@addWebMessageListener
      val data = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
      val id = data.optString("id")
      val key = data.optString("session")
      fun respond(value: Any?) {
        reply.postMessage(JSONObject().put("id", id).put("result", value ?: JSONObject.NULL).toString())
      }
      try {
        when (data.getString("type")) {
          "reset" -> { close(); respond(true) }
          "start" -> {
            val url = Uri.parse(data.getString("url"))
            require(allowed(url)) { "Enter an HTTP or HTTPS URL" }
            close()
            session = key
            val view = WebView(activity)
            view.outlineProvider = object : ViewOutlineProvider() {
              override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, cornerRadius)
              }
            }
            view.clipToOutline = true
            guest = view
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.allowFileAccess = false
            view.settings.allowContentAccess = false
            view.webViewClient = object : WebViewClient() {
              override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !allowed(request.url)
            }
            view.visibility = View.INVISIBLE
            activity.findViewById<FrameLayout>(android.R.id.content).addView(view)
            val proxy = data.optString("proxy").takeUnless { it.isEmpty() || it == "null" }
            fun load() {
              if (guest === view) view.loadUrl(url.toString())
              respond(true)
            }
            if (proxy == null) load() else {
              check(WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) { "Update Android System WebView to use a proxy" }
              val config = ProxyConfig.Builder().addProxyRule(proxy)
                .addBypassRule("*.localhost").addBypassRule("tauri.localhost").addBypassRule("127.0.0.1").build()
              ProxyController.getInstance().setProxyOverride(config, ContextCompat.getMainExecutor(activity), ::load)
            }
          }
          "close" -> { if (session == key) close(); respond(true) }
          else -> {
            val view = requireNotNull(guest?.takeIf { session == key }) { "Client browser closed" }
            when (data.getString("type")) {
              "navigate" -> {
                val url = Uri.parse(data.getString("url"))
                require(allowed(url)) { "Enter an HTTP or HTTPS URL" }
                if (view.url == url.toString()) view.reload() else view.loadUrl(url.toString())
                respond(true)
              }
              "bounds" -> {
                val scale = host.width.toDouble() / data.getDouble("viewport").coerceAtLeast(1.0)
                fun px(name: String) = (data.getDouble(name) * scale).roundToInt()
                val bounds = activity.findViewById<FrameLayout>(android.R.id.content)
                val pos = IntArray(2)
                val root = IntArray(2)
                host.getLocationOnScreen(pos)
                bounds.getLocationOnScreen(root)
                if (px("height") > 0 && px("width") > 0) {
                  val radius = (data.optDouble("radius", 0.0) * scale).toFloat()
                  if (radius != cornerRadius) {
                    cornerRadius = radius
                    view.invalidateOutline()
                  }
                  view.layoutParams = FrameLayout.LayoutParams(px("width"), px("height"), Gravity.TOP or Gravity.LEFT).apply {
                    leftMargin = pos[0] - root[0] - bounds.paddingLeft + px("left")
                    topMargin = pos[1] - root[1] - bounds.paddingTop + px("top")
                  }
                  view.visibility = View.VISIBLE
                } else {
                  view.visibility = View.INVISIBLE
                }
                respond(true)
              }
              "snapshot" -> {
                check(android.os.Build.VERSION.SDK_INT >= 26 && view.isShown && view.width > 0 && view.height > 0) { "Browser view unavailable" }
                val pos = IntArray(2)
                view.getLocationInWindow(pos)
                check(!capturing) { "Page capture in progress" }
                val rect = android.graphics.Rect(pos[0], pos[1], pos[0] + view.width, pos[1] + view.height)
                val window = activity.window.decorView
                check(android.graphics.Rect(0, 0, window.width, window.height).contains(rect)) { "Browser view changed during capture" }
                val scale = minOf(1.0, 2048.0 / maxOf(view.width, view.height))
                val bitmap = android.graphics.Bitmap.createBitmap((view.width * scale).roundToInt().coerceAtLeast(1), (view.height * scale).roundToInt().coerceAtLeast(1), android.graphics.Bitmap.Config.ARGB_8888)
                capturing = true
                try {
                  android.view.PixelCopy.request(activity.window, rect, bitmap, { result ->
                  if (result == android.view.PixelCopy.SUCCESS && guest === view) {
                    java.util.concurrent.ForkJoinPool.commonPool().execute {
                      val encoded = runCatching {
                        val bytes = java.io.ByteArrayOutputStream()
                        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bytes)
                        "data:image/png;base64," + android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP)
                      }
                      bitmap.recycle()
                      activity.runOnUiThread { capturing = false; encoded.fold({ respond(it) }, { reply.postMessage(JSONObject().put("id",id).put("error","Capture failed").toString()) }) }
                    }
                  } else {
                    capturing = false
                    bitmap.recycle()
                    reply.postMessage(JSONObject().put("id",id).put("error","Browser view changed during capture").toString())
                  }
                  }, android.os.Handler(android.os.Looper.getMainLooper()))
                } catch (error: Exception) {
                  capturing = false
                  bitmap.recycle()
                  throw error
                }
              }
              "run" -> {
                require(allowed(Uri.parse(view.url ?: ""))) { "Page is loading" }
                view.evaluateJavascript(data.getString("script")) { raw ->
                  // Page navigation may destroy the JS world before a result is returned.
                  respond(runCatching { JSONTokener(raw ?: "null").nextValue() }.getOrNull())
                }
              }
              else -> error("Unknown client browser request")
            }
          }
        }
      } catch (e: Exception) {
        reply.postMessage(JSONObject().put("id",id).put("error",e.message ?: "Browser error").toString())
      }
    }
  }
  fun resetOnHostReload() {
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(host,
        """if (window === window.top) window.wishDeviceBrowser.postMessage('{"type":"reset"}');""",
        setOf("http://tauri.localhost","https://tauri.localhost"))
    }
  }
  fun close() {
    guest?.let {
      (it.parent as? android.view.ViewGroup)?.removeView(it)
      it.stopLoading()
      it.destroy()
    }
    guest = null
    session = ""
  }
}
