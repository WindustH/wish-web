mod bridge;
#[cfg(desktop)]
mod package_download;
#[cfg(desktop)]
mod device_browser;
mod device_proxy;
mod ssh;
use bridge::{Bridge, http_target};
use tauri::Manager;

#[tauri::command]
fn native_session(bridge: tauri::State<Bridge>) -> Option<String> {
  bridge.base()
}
#[tauri::command]
fn native_http(
  proxy: tauri::State<device_proxy::DeviceProxy>,
  bridge: tauri::State<Bridge>,
  address: String,
) -> Result<(), String> {
  proxy.require_valid()?;
  bridge.install(http_target(&address).map_err(|e| e.to_string())?);
  Ok(())
}
#[tauri::command]
async fn native_logout(
  _app: tauri::AppHandle,
  bridge: tauri::State<'_, Bridge>,
  login: tauri::State<'_, ssh::Login>,
) -> Result<(), String> {
  #[cfg(desktop)]
  device_browser::close_guests(&_app);
  login.disconnect(&bridge).await;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let handlers: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
    device_proxy::device_proxy_settings,
    device_proxy::device_browser_proxy,
    #[cfg(desktop)]
    package_download::save_session_package,
    native_session,
    native_http,
    native_logout,
    ssh::ssh_login,
    ssh::ssh_prove,
    #[cfg(desktop)]
    device_browser::device_browser
  ];
  let builder = tauri::Builder::default();
  #[cfg(desktop)]
  let builder = builder
    .manage(device_browser::LoadedPages::default())
    .on_page_load(|webview, payload| {
      if webview.label() == "main" && payload.event() == tauri::webview::PageLoadEvent::Started {
        device_browser::close_guests(webview.app_handle());
      }
    });
  builder
    .manage(ssh::Login::default())
    .setup(|app| {
      let proxy = device_proxy::DeviceProxy::open(app.path().app_config_dir()?)?;
      app.manage(tauri::async_runtime::block_on(Bridge::start(
        proxy.backend.clone(),
      ))?);
      app.manage(proxy);
      Ok(())
    })
    .invoke_handler(move |invoke| {
      if invoke.message.webview().label() != "main" {
        invoke.resolver.reject("Invalid Wish host");
        return true;
      }
      handlers(invoke)
    })
    .run(tauri::generate_context!())
    .expect("run Wish");
}
