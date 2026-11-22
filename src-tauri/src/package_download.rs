// Stream a ZIP through this login's bridge into the user's Downloads directory.
use crate::bridge::Bridge;
use anyhow::{Context, Result, ensure};
use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use hyper_util::rt::TokioIo;
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn save_session_package(
  bridge: tauri::State<'_, Bridge>,
  url: String,
) -> Result<String, String> {
  save(&bridge, &url).await.map_err(|e| e.to_string())
}
async fn save(bridge: &Bridge, address: &str) -> Result<String> {
  let base = bridge.base().context("Connection closed")?;
  let url = url::Url::parse(address)?;
  let route = address
    .strip_prefix(&(base + "/"))
    .context("Invalid download URL")?
    .split('?')
    .next()
    .unwrap_or("");
  let pieces: Vec<_> = route.split('/').collect();
  let id = match pieces.as_slice() {
    ["exports", id] | ["archives", id, "download"] => uuid::Uuid::parse_str(id)?,
    _ => anyhow::bail!("Invalid package download"),
  };
  let host = url.host_str().context("Missing bridge address")?;
  let port = url.port().context("Missing bridge port")?;
  let socket = tokio::net::TcpStream::connect((host, port)).await?;
  let (mut sender, connection) =
    hyper::client::conn::http1::handshake(TokioIo::new(socket)).await?;
  tauri::async_runtime::spawn(connection);
  let uri = &url[url::Position::BeforePath..url::Position::AfterQuery];
  let response = sender
    .send_request(
      Request::get(uri)
        .header("host", format!("{host}:{port}"))
        .body(Body::empty())?,
    )
    .await?;
  ensure!(response.status().is_success(), "HTTP {}", response.status());
  ensure!(
    response
      .headers()
      .get("content-type")
      .and_then(|v| v.to_str().ok())
      == Some("application/zip"),
    "Expected ZIP download"
  );
  let filename = response
    .headers()
    .get("content-disposition")
    .and_then(|h| h.to_str().ok())
    .and_then(|s| s.strip_prefix("attachment; filename=\""))
    .and_then(|s| s.strip_suffix('"'))
    .filter(|s| {
      s.ends_with(".zip")
        && s
          .bytes()
          .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
    })
    .map(str::to_owned)
    .unwrap_or_else(|| format!("archive-{id}.zip"));
  let directory = dirs::download_dir().context("Downloads directory unavailable")?;
  tokio::fs::create_dir_all(&directory).await?;
  let temporary = tempfile::NamedTempFile::new_in(&directory)?;
  let mut output = tokio::fs::File::from_std(temporary.reopen()?);
  let mut body = response.into_body();
  while let Some(frame) = body.frame().await {
    if let Ok(data) = frame?.into_data() {
      output.write_all(&data).await?;
    }
  }
  output.flush().await?;
  drop(output);
  let mut destination = directory.join(&filename);
  if destination.try_exists()? {
    destination = directory.join(format!(
      "{}-{}.zip",
      filename.trim_end_matches(".zip"),
      uuid::Uuid::new_v4()
    ));
  }
  temporary.persist_noclobber(&destination)?;
  Ok(destination.display().to_string())
}
