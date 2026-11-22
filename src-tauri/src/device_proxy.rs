// Device-local network policy. Keep a launch snapshot so a live SSH tunnel,
// streaming API requests and the embedded browser always agree on the route.
use anyhow::{Context, Result, ensure};
use axum::{
  body::Body,
  http::{Method, Request},
};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::{
  io::{AsyncRead, AsyncWrite},
  net::TcpStream,
};
use url::Url;

pub trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}
pub type Socket = Box<dyn Stream>;

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
  pub url: String,
  pub backend: bool,
}

impl Settings {
  fn endpoint(&self) -> Result<Option<Url>> {
    if self.url.is_empty() {
      return Ok(None);
    }
    #[cfg(target_os = "macos")]
    ensure!(
      objc2::available!(macos = 14.0),
      "Browser proxy requires macOS 14 or later"
    );
    let mut url = Url::parse(&self.url)?;
    ensure!(
      matches!(url.scheme(), "http" | "socks5")
        && url.has_host()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(url.path(), "" | "/")
        && url.query().is_none()
        && url.fragment().is_none()
        && url.port() != Some(0),
      "Expected http://host:port or socks5://host:port without credentials"
    );
    if url.scheme() == "socks5" && url.port().is_none() {
      url.set_port(Some(1080)).ok();
    }
    Ok(Some(url))
  }
}

pub struct DeviceProxy {
  file: PathBuf,
  pub browser: Option<Url>,
  pub backend: Option<Url>,
  load_error: Option<String>,
  #[cfg(desktop)]
  http_default: tokio::sync::OnceCell<Url>,
}

impl DeviceProxy {
  pub fn open(dir: PathBuf) -> Result<Self> {
    let file = dir.join("device-proxy.json");
    let loaded = Self::read(&file).and_then(|saved| Ok((saved.endpoint()?, saved.backend)));
    let (browser, apply_backend, load_error) = match loaded {
      Ok((url, backend)) => (url, backend, None),
      Err(error) => (
        None,
        false,
        Some(format!(
          "Invalid device proxy settings: {error}. Open Network settings to repair them and restart Wish."
        )),
      ),
    };
    let backend = browser.clone().filter(|_| apply_backend);
    Ok(Self {
      file,
      load_error,
      #[cfg(desktop)]
      http_default: Default::default(),
      browser,
      backend,
    })
  }
  pub fn require_valid(&self) -> Result<(), String> {
    self
      .load_error
      .as_ref()
      .map_or(Ok(()), |error| Err(error.clone()))
  }
  // Wry takes the literal port from Url. Its HTTP default (80) is always
  // normalized away by the URL parser. Give only that case a local endpoint.
  #[cfg(desktop)]
  pub async fn webview_proxy(&self) -> Result<Option<Url>> {
    self.require_valid().map_err(anyhow::Error::msg)?;
    let Some(url) = &self.browser else {
      return Ok(None);
    };
    if url.port().is_some() {
      return Ok(Some(url.clone()));
    }
    let endpoint = self
      .http_default
      .get_or_try_init(|| async {
        let host = url
          .host_str()
          .context("Missing proxy host")?
          .trim_matches(['[', ']'])
          .to_owned();
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
        let local = Url::parse(&format!("http://{}", listener.local_addr()?))?;
        let limit = std::sync::Arc::new(tokio::sync::Semaphore::new(128));
        tauri::async_runtime::spawn(async move {
          while let Ok((mut downstream, _)) = listener.accept().await {
            let Ok(permit) = limit.clone().try_acquire_owned() else {
              continue;
            };
            let host = host.clone();
            tokio::spawn(async move {
              let _permit = permit;
              if let Ok(Ok(mut upstream)) = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                TcpStream::connect((host.as_str(), 80)),
              )
              .await
              {
                let _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await;
              }
            });
          }
        });
        Ok::<_, anyhow::Error>(local)
      })
      .await?;
    Ok(Some(endpoint.clone()))
  }
  fn read(file: &std::path::Path) -> Result<Settings> {
    match std::fs::read(file) {
      Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
      Err(e) => Err(e.into()),
    }
  }
}
#[tauri::command]
pub fn device_proxy_settings(
  state: tauri::State<DeviceProxy>,
  settings: Option<Settings>,
) -> Result<Settings, String> {
  (|| -> Result<_> {
    if let Some(mut settings) = settings {
      if settings.url.is_empty() {
        settings.backend = false;
      }
      settings.endpoint()?;
      let dir = state.file.parent().context("Missing settings directory")?;
      std::fs::create_dir_all(dir)?;
      let mut temp = tempfile::NamedTempFile::new_in(dir)?;
      serde_json::to_writer(&mut temp, &settings)?;
      temp.persist(&state.file)?;
      Ok(settings)
    } else {
      DeviceProxy::read(&state.file)
    }
  })()
  .map_err(|e| e.to_string())
}

pub async fn connect(proxy: Option<&Url>, host: &str, port: u16) -> Result<Socket> {
  let Some(proxy) = proxy else {
    return Ok(Box::new(TcpStream::connect((host, port)).await?));
  };
  let addr = (
    proxy
      .host_str()
      .context("Missing proxy host")?
      .trim_matches(['[', ']']),
    proxy
      .port_or_known_default()
      .context("Missing proxy port")?,
  );
  let tcp = TcpStream::connect(addr).await?;
  if proxy.scheme() == "socks5" {
    let stream = tokio_socks::tcp::Socks5Stream::connect_with_socket(tcp, (host, port)).await?;
    return Ok(Box::new(stream));
  }
  let authority = if host.contains(':') {
    format!("[{host}]:{port}")
  } else {
    format!("{host}:{port}")
  };
  let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(tcp)).await?;
  tokio::spawn(connection.with_upgrades());
  let request = Request::builder()
    .method(Method::CONNECT)
    .uri(&authority)
    .header("host", &authority)
    .body(Body::empty())?;
  let response = sender.send_request(request).await?;
  ensure!(
    response.status().is_success(),
    "Proxy refused CONNECT ({})",
    response.status()
  );
  Ok(Box::new(TokioIo::new(hyper::upgrade::on(response).await?)))
}

#[tauri::command]
pub fn device_browser_proxy(state: tauri::State<DeviceProxy>) -> Result<Option<String>, String> {
  state.require_valid()?;
  Ok(state.browser.as_ref().map(|u| {
    format!(
      "{}://{}:{}",
      u.scheme(),
      u.host().unwrap(),
      u.port_or_known_default().unwrap()
    )
  }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
  };
  #[tokio::test]
  async fn tunnels_backend_bytes_through_the_selected_device_proxy() {
    for scheme in ["http", "socks5"] {
      let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
      let url = Url::parse(&format!("{scheme}://{}", listener.local_addr().unwrap())).unwrap();
      let peer = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        if scheme == "socks5" {
          let mut greeting = [0; 3];
          socket.read_exact(&mut greeting).await.unwrap();
          assert_eq!(greeting, [5, 1, 0]);
          socket.write_all(&[5, 0]).await.unwrap();
          let mut connect = [0; 5];
          socket.read_exact(&mut connect).await.unwrap();
          assert_eq!(connect, [5, 1, 0, 3, 12]);
          let mut host = [0; 12];
          socket.read_exact(&mut host).await.unwrap();
          assert_eq!(&host, b"wish.invalid");
          assert_eq!(socket.read_u16().await.unwrap(), 2222);
          socket
            .write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 0])
            .await
            .unwrap();
        } else {
          let mut head = Vec::new();
          while !head.ends_with(b"\r\n\r\n") {
            head.push(socket.read_u8().await.unwrap());
          }
          assert!(head.starts_with(b"CONNECT wish.invalid:2222 HTTP/1.1\r\n"));
          socket
            .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
            .await
            .unwrap();
        }
        let mut bytes = [0; 4];
        socket.read_exact(&mut bytes).await.unwrap();
        assert_eq!(&bytes, b"ping");
        socket.write_all(b"pong").await.unwrap();
      });
      let mut stream = connect(Some(&url), "wish.invalid", 2222).await.unwrap();
      stream.write_all(b"ping").await.unwrap();
      let mut reply = [0; 4];
      stream.read_exact(&mut reply).await.unwrap();
      assert_eq!(&reply, b"pong");
      peer.await.unwrap();
    }
  }
}
