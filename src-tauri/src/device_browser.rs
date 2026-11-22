//! The main WebView owns each embedded guest. Only the packaged interface may
//! dispatch commands and the guest may navigate to ordinary web origins.
use serde::Deserialize;
use serde_json::Value;
use tauri::{
  LogicalPosition, Manager, Webview, WebviewUrl,
  webview::{NewWindowResponse, WebviewBuilder},
};
use url::Url;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Request {
  Start {
    url: Url,
  },
  Navigate {
    url: Url,
  },
  Bounds {
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    viewport: f64,
  },
  Run {
    args: Value,
  },
  Snapshot,
  Close,
}

fn web_page(url: &Url) -> bool {
  matches!(url.scheme(), "http" | "https")
    && url.host_str().is_some_and(|h| {
      !h.to_ascii_lowercase()
        .trim_end_matches('.')
        .ends_with(".localhost")
    })
}

#[derive(Default)]
pub struct LoadedPages(std::sync::Mutex<std::collections::HashSet<String>>);
impl LoadedPages {
  fn mark(&self, label: &str, ready: bool) {
    let mut pages = self
      .0
      .lock()
      .unwrap_or_else(std::sync::PoisonError::into_inner);
    if ready {
      pages.insert(label.to_owned());
    } else {
      pages.remove(label);
    }
  }
}
pub fn close_guests(app: &tauri::AppHandle) {
  for (label, guest) in app.webviews() {
    if label.starts_with("device-") {
      app.state::<LoadedPages>().mark(&label, false);
      let _ = guest.close();
    }
  }
}
#[tauri::command]
pub async fn device_browser(
  host: Webview,
  attachment: String,
  request: Request,
) -> Result<Value, String> {
  if host.label() != "main" {
    return Err("Invalid browser host".into());
  }
  let id = Uuid::parse_str(&attachment).map_err(|e| e.to_string())?;
  let label = format!("device-{id}");
  let fail = |e: tauri::Error| e.to_string();
  match request {
    Request::Start { url } => {
      if !web_page(&url) {
        return Err("Enter an HTTP or HTTPS website address".into());
      }
      close_guests(host.app_handle());
      let guest = WebviewBuilder::new(label, WebviewUrl::External(url))
        .incognito(true)
        .focused(false)
        .on_page_load(|view, event| {
          // Wry delivers Started at WebKit commit / WebView2 ContentLoading.
          if event.event() == tauri::webview::PageLoadEvent::Started {
            view.state::<LoadedPages>().mark(view.label(), true);
          }
        })
        .on_navigation(web_page)
        .on_new_window(|_, _| NewWindowResponse::Deny);
      #[cfg(windows)]
      let guest = guest.data_directory(
        host
          .path()
          .app_cache_dir()
          .map_err(fail)?
          .join("device-browser"),
      );
      let guest = match host
        .state::<crate::device_proxy::DeviceProxy>()
        .webview_proxy()
        .await
        .map_err(|error| error.to_string())?
      {
        Some(proxy) => guest.proxy_url(proxy),
        None => guest,
      };
      let size = host.size().map_err(fail)?;
      host
        .window()
        .add_child(
          guest,
          LogicalPosition::new(-(size.width as f64 + 1.), 0.),
          size,
        )
        .map_err(fail)?;
    }
    Request::Close => {
      host.state::<LoadedPages>().mark(&label, false);
      if let Some(guest) = host.get_webview(&label) {
        guest.close().map_err(fail)?;
      }
    }
    other => {
      let guest = host.get_webview(&label).ok_or("Client browser closed")?;
      match other {
        Request::Navigate { url } => {
          if !web_page(&url) {
            return Err("Enter an HTTP or HTTPS website address".into());
          }
          let previous = guest.url().map_err(fail)?;
          let same_document = url != previous
            && url[..url::Position::AfterQuery] == previous[..url::Position::AfterQuery];
          if !same_document {
            host.state::<LoadedPages>().mark(&label, false);
          }
          let dispatched = if previous == url {
            guest.reload()
          } else {
            guest.navigate(url)
          };
          if let Err(error) = dispatched {
            if !same_document {
              host.state::<LoadedPages>().mark(&label, true);
            }
            return Err(fail(error));
          }
        }
        Request::Bounds {
          left,
          top,
          width,
          height,
          viewport,
        } => {
          if width <= 0. || height <= 0. {
            guest.hide().map_err(fail)?;
          } else {
            let scale = f64::from(host.size().map_err(fail)?.width) / viewport.max(1.);
            guest
              .set_bounds(tauri::Rect {
                position: tauri::PhysicalPosition::new(
                  (left * scale).round() as i32,
                  (top * scale).round() as i32,
                )
                .into(),
                size: tauri::PhysicalSize::new(
                  (width * scale).round() as u32,
                  (height * scale).round() as u32,
                )
                .into(),
              })
              .map_err(fail)?;
            guest.show().map_err(fail)?;
          }
        }
        Request::Run { .. } | Request::Snapshot
          if !host
            .state::<LoadedPages>()
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(&label)
            || !web_page(&guest.url().map_err(fail)?) =>
        {
          return Err("Page is loading".into());
        }
        Request::Snapshot => return snapshot(&guest).await.map(Value::String),
        Request::Run { args } => {
          let actions = include_str!("../../src/platform/devicePage.js");
          let script = format!(
            "(()=>{{try{{{actions}\nreturn {{result:wishPageAction({args})}} }} catch(e){{return {{error:String(e.message||e)}}}} }})()"
          );
          let (tx, mut rx) = tokio::sync::mpsc::channel(1);
          guest
            .eval_with_callback(script, move |raw| {
              let _ = tx.try_send(raw);
            })
            .map_err(fail)?;
          let raw = tokio::time::timeout(std::time::Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Client browser timed out")?
            .ok_or("Client browser closed")?;
          if raw.is_empty() || raw == "null" {
            return Err("Page changed before the operation returned".into());
          }
          return serde_json::from_str(&raw).map_err(|e| e.to_string());
        }
        _ => unreachable!(),
      }
    }
  }
  Ok(Value::Null)
}

#[cfg(target_os = "linux")]
async fn snapshot(guest: &Webview) -> Result<String, String> {
  use base64::Engine;
  use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};
  let (tx, rx) = tokio::sync::oneshot::channel();
  guest
    .with_webview(move |webview| {
      let view = webview.inner();
      webkit2gtk::glib::MainContext::default().spawn_local(async move {
        let result = async {
          let surface = view
            .snapshot_future(SnapshotRegion::Visible, SnapshotOptions::empty())
            .await
            .map_err(|e| e.to_string())?;
          let mut bytes = Vec::new();
          surface
            .write_to_png(&mut bytes)
            .map_err(|e| e.to_string())?;
          Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
          ))
        }
        .await;
        let _ = tx.send(result);
      });
    })
    .map_err(|e| e.to_string())?;
  rx.await.map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "linux"))]
async fn snapshot(guest: &Webview) -> Result<String, String> {
  // Evaluate only the bundled renderer. Navigation destroys the pending capture along with its document.
  let key = format!("__wishCapture{}", Uuid::new_v4().simple());
  let renderer = include_str!("../../node_modules/html2canvas/dist/html2canvas.min.js");
  guest.eval(format!("(()=>{{ {renderer}
requestAnimationFrame(()=>window.html2canvas(document.documentElement,{{x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,scale:Math.min(devicePixelRatio,2048/Math.max(innerWidth,innerHeight)),useCORS:true,logging:false,imageTimeout:4000}}).then(c=>window.{key}=c.toDataURL('image/png'),e=>window.{key}=String(e))); }})()")).map_err(|e|e.to_string())?;
  let result = tokio::time::timeout(std::time::Duration::from_secs(12), async {
    loop {
      let (tx, rx) = tokio::sync::oneshot::channel();
      guest
        .eval_with_callback(
          format!("(()=>{{const s=window.{key};delete window.{key};return s||null}})()"),
          move |s| {
            let _ = tx.send(s);
          },
        )
        .map_err(|e| e.to_string())?;
      let raw = rx.await.map_err(|e| e.to_string())?;
      if raw.is_empty() {
        return Err("Page changed before the operation returned".into());
      }
      if let Some(value) =
        serde_json::from_str::<Option<String>>(&raw).map_err(|e| e.to_string())?
      {
        return if value.starts_with("data:image/png;base64,") {
          Ok(value)
        } else {
          Err(value)
        };
      }
      tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }
  })
  .await
  .map_err(|_| "Page capture timed out".to_string());
  let _ = guest.eval(format!("delete window.{key}"));
  result?
}
