mod bridge;
mod ssh;
use bridge::{Bridge, http_target};
use tauri::Manager;

#[tauri::command]
fn native_session(bridge: tauri::State<Bridge>) -> Option<String> {
  bridge.base()
}
#[tauri::command]
fn native_http(bridge: tauri::State<Bridge>, address: String) -> Result<(), String> {
  bridge.install(http_target(&address).map_err(|e| e.to_string())?);
  Ok(())
}
#[tauri::command]
async fn native_logout(bridge: tauri::State<'_, Bridge>, login: tauri::State<'_, ssh::Login>) -> Result<(), String> {
  login.disconnect(&bridge).await;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(ssh::Login::default())
    .setup(|app| {
      app.manage(tauri::async_runtime::block_on(Bridge::start())?);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      native_session,
      native_http,
      native_logout,
      ssh::ssh_login,
      ssh::ssh_prove
    ])
    .run(tauri::generate_context!())
    .expect("run Wish");
}
