package io.github.windusth.wish

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Proxy
import java.net.URI

/** The login's loopback bridge and its ZIP stream both belong to the app process. */
internal class PackageDownloads(private val activity: MainActivity) {
  private class Download(val id: String, val uri: URI, val filename: String, val reply: JavaScriptReplyProxy) {
    fun finish(field: String, value: Any) {
      reply.postMessage(JSONObject().put("id", id).put(field, value).toString())
    }
  }

  private val zipMime = "application/zip"
  private val uuid = "[0-9a-fA-F-]{36}"
  private val packagePath = Regex("/$uuid/api/(exports/$uuid|archives/$uuid/download)")
  private val packageName = Regex("[A-Za-z0-9_-]+[.]zip")
  private var active: Download? = null
  private val pickDocument =
    activity.registerForActivityResult(ActivityResultContracts.CreateDocument(zipMime)) { destination ->
      val download = active ?: return@registerForActivityResult
      if (destination == null) {
        active = null
        download.finish("cancelled", true)
      } else save(download, destination)
    }

  fun install(webView: WebView) {
    WebViewCompat.addWebMessageListener(
      webView, "wishPackageDownload", setOf("http://tauri.localhost", "https://tauri.localhost")
    ) { _, message, _, mainFrame, reply ->
      if (!mainFrame) return@addWebMessageListener
      val input = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
      val id = input.optString("id")
      if (active != null) {
        reply.postMessage(JSONObject().put("id", id).put("error", "Another ZIP download is in progress").toString())
        return@addWebMessageListener
      }
      try {
        val uri = URI(input.getString("url"))
        val filename = input.getString("filename")
        require(uri.scheme == "http" && uri.host == "127.0.0.1" && uri.port in 1..65535 &&
          uri.rawUserInfo == null && uri.rawFragment == null && packagePath.matches(uri.rawPath.orEmpty()) &&
          packageName.matches(filename)) { "Invalid package download" }
        val download = Download(id, uri, filename, reply)
        active = download
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) save(download)
        else pickDocument.launch(filename)
      } catch (error: Exception) {
        active = null
        reply.postMessage(JSONObject().put("id", id).put("error", error.message ?: "Download failed").toString())
      }
    }
  }

  private fun save(download: Download, document: Uri? = null) {
    activity.lifecycleScope.launch {
      try {
        val location = withContext(Dispatchers.IO) { writePackage(download, document) }
        download.finish("location", location)
      } catch (cancelled: CancellationException) {
        throw cancelled
      } catch (error: Exception) {
        download.finish("error", error.message ?: "Download failed")
      } finally {
        active = null
      }
    }
  }

  private suspend fun writePackage(download: Download, document: Uri?): String {
    val resolver = activity.contentResolver
    val connection = download.uri.toURL().openConnection(Proxy.NO_PROXY) as HttpURLConnection
    connection.connectTimeout = 10_000
    connection.readTimeout = 60_000
    connection.instanceFollowRedirects = false
    connection.setRequestProperty("Accept-Encoding", "identity")
    var destination = document
    var complete = false
    try {
      val status = connection.responseCode
      check(status == HttpURLConnection.HTTP_OK) { "HTTP $status" }
      check(connection.contentType == zipMime) { "Expected ZIP download" }
      val output = document ?: run {
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        createDownload(download.filename)
      }
      destination = output
      val expected = connection.contentLengthLong
      connection.inputStream.use { input ->
        checkNotNull(resolver.openOutputStream(output)) { "Unable to open destination" }.use { sink ->
          val buffer = ByteArray(64 * 1024)
          var written = 0L
          while (true) {
            currentCoroutineContext().ensureActive()
            val count = input.read(buffer)
            if (count < 0) break
            sink.write(buffer, 0, count)
            written += count
          }
          check(expected < 0 || expected == written) { "Incomplete ZIP download" }
        }
      }
      if (document == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val published = resolver.update(output, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        check(published == 1) { "Unable to finish saving ZIP" }
      }
      complete = true
      val name = runCatching {
        resolver.query(output, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
          if (it.moveToFirst()) it.getString(0) else null
        }
      }.getOrNull() ?: download.filename
      return if (document == null) "${Environment.DIRECTORY_DOWNLOADS}/$name" else name
    } finally {
      connection.disconnect()
      if (!complete) destination?.let { runCatching { resolver.delete(it, null, null) } }
    }
  }

  @RequiresApi(Build.VERSION_CODES.Q)
  private fun createDownload(filename: String): Uri {
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, filename)
      put(MediaStore.Downloads.MIME_TYPE, zipMime)
      put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    return checkNotNull(activity.contentResolver.insert(
      MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values
    )) { "Unable to create file in Downloads" }
  }
}
