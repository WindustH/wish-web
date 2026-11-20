// The bundled WebView keeps its stable storage origin. A per-login loopback URL carries
// streaming fetches, media range requests and terminal WebSockets through the same transport.
use crate::ssh::SshHandle;
use anyhow::{Context, Result, ensure};
use axum::{
  Router,
  body::Body,
  extract::{Request, State},
  http::{HeaderValue, Method, StatusCode, header},
  response::{IntoResponse, Response},
};
use hyper_util::rt::TokioIo;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};
use tokio::{
  io::{AsyncRead, AsyncWrite},
  net::{TcpListener, TcpStream},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

trait Stream: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> Stream for T {}
pub enum Target {
  Ssh(SshHandle, u16),
  Http(url::Url),
}
struct Session {
  secret: String,
  target: Target,
  stop: CancellationToken,
}
#[derive(Clone)]
pub struct Bridge {
  authority: String,
  current: Arc<RwLock<Option<Arc<Session>>>>,
}
impl Bridge {
  pub async fn start() -> Result<Self> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let bridge = Self {
      authority: listener.local_addr()?.to_string(),
      current: Default::default(),
    };
    let app = Router::new().fallback(dispatch).with_state(bridge.clone());
    tauri::async_runtime::spawn(async move {
      let _ = axum::serve(listener, app).await;
    });
    Ok(bridge)
  }
  pub fn base(&self) -> Option<String> {
    self
      .current
      .read()
      .unwrap()
      .as_ref()
      .filter(|s| match &s.target {
        Target::Ssh(h, _) => !h.is_closed(),
        _ => true,
      })
      .map(|s| format!("http://{}/{}/api", self.authority, s.secret))
  }
  // In-flight stream retries and media URLs retain the capability for this login.
  // A late reconnect must never replace a newer login or undo logout.
  pub fn resume_ssh(&self, expected: &str, handle: SshHandle, port: u16) -> Result<()> {
    let mut current = self.current.write().unwrap();
    let old = current.as_ref().context("SSH session ended")?;
    ensure!(
      matches!(&old.target, Target::Ssh(_, p) if *p == port)
        && format!("http://{}/{}/api", self.authority, old.secret) == expected,
      "SSH session changed"
    );
    old.stop.cancel();
    *current = Some(Arc::new(Session {
      secret: old.secret.clone(),
      target: Target::Ssh(handle, port),
      stop: CancellationToken::new(),
    }));
    Ok(())
  }
  pub fn close(&self) {
    if let Some(old) = self.current.write().unwrap().take() {
      old.stop.cancel();
    }
  }
  pub fn install(&self, target: Target) {
    let session = Arc::new(Session {
      secret: Uuid::new_v4().to_string(),
      target,
      stop: CancellationToken::new(),
    });
    if let Some(old) = self.current.write().unwrap().replace(session) {
      old.stop.cancel();
    }
  }
}
fn app_origin(s: &str) -> bool {
  matches!(
    s,
    "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
  )
}
async fn dispatch(State(bridge): State<Bridge>, req: Request) -> Response {
  if req
    .headers()
    .get(header::HOST)
    .and_then(|h| h.to_str().ok())
    != Some(&bridge.authority)
  {
    return StatusCode::MISDIRECTED_REQUEST.into_response();
  }
  let origin = req.headers().get(header::ORIGIN).cloned();
  if origin
    .as_ref()
    .is_some_and(|h| !h.to_str().is_ok_and(app_origin))
  {
    return StatusCode::FORBIDDEN.into_response();
  }
  let Some(session) = bridge.current.read().unwrap().clone() else {
    return StatusCode::UNAUTHORIZED.into_response();
  };
  let prefix = format!("/{}/api", session.secret);
  let Some(suffix) = req.uri().path().strip_prefix(&prefix) else {
    return StatusCode::FORBIDDEN.into_response();
  };
  if !suffix.is_empty() && !suffix.starts_with('/') {
    return StatusCode::NOT_FOUND.into_response();
  }
  let path = match req.uri().query() {
    Some(q) => format!("{suffix}?{q}"),
    None => suffix.to_owned(),
  };
  let mut res = if req.method() == Method::OPTIONS {
    StatusCode::NO_CONTENT.into_response()
  } else {
    match forward(&session, req, path).await {
      Ok(res) => res,
      Err(_) => StatusCode::BAD_GATEWAY.into_response(),
    }
  };
  let h = res.headers_mut();
  // The backend cannot grant browser access to the local bridge.
  for name in [
    header::ACCESS_CONTROL_ALLOW_ORIGIN,
    header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
    header::SET_COOKIE,
  ] {
    h.remove(name);
  }
  if let Some(origin) = origin {
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    h.insert(
      header::ACCESS_CONTROL_ALLOW_METHODS,
      HeaderValue::from_static("GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"),
    );
    h.insert(
      header::ACCESS_CONTROL_ALLOW_HEADERS,
      HeaderValue::from_static("*, Authorization"),
    );
    h.insert(
      header::ACCESS_CONTROL_EXPOSE_HEADERS,
      HeaderValue::from_static("*"),
    );
  }
  res
}
async fn transport(target: &Target) -> Result<Box<dyn Stream>> {
  match target {
    Target::Ssh(h, port) => Ok(Box::new(
      h.channel_open_direct_tcpip("localhost", u32::from(*port), "127.0.0.1", 0)
        .await?
        .into_stream(),
    )),
    Target::Http(url) => {
      let host = url
        .host_str()
        .context("missing host")?
        .trim_matches(['[', ']']);
      let tcp =
        TcpStream::connect((host, url.port_or_known_default().context("missing port")?)).await?;
      if url.scheme() == "https" {
        let roots =
          rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let config = rustls::ClientConfig::builder()
          .with_root_certificates(roots)
          .with_no_client_auth();
        let name = rustls::pki_types::ServerName::try_from(host.to_owned())?;
        Ok(Box::new(
          tokio_rustls::TlsConnector::from(Arc::new(config))
            .connect(name, tcp)
            .await?,
        ))
      } else {
        Ok(Box::new(tcp))
      }
    }
  }
}
async fn forward(session: &Session, mut req: Request, path: String) -> Result<Response> {
  let (host, base) = match &session.target {
    Target::Ssh(_, port) => (format!("localhost:{port}"), "/api"),
    Target::Http(url) => (
      url[url::Position::BeforeHost..url::Position::AfterPort].to_owned(),
      url.path().trim_end_matches('/'),
    ),
  };
  *req.uri_mut() = format!("{base}{path}").parse()?;
  let upgrade = req
    .headers()
    .get(header::UPGRADE)
    .is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"websocket"));
  let downstream = upgrade.then(|| hyper::upgrade::on(&mut req));
  let h = req.headers_mut();
  for name in [
    "origin",
    "cookie",
    "referer",
    "sec-fetch-site",
    "accept-encoding",
    "proxy-authorization",
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
  ] {
    h.remove(name);
  }
  h.insert(header::HOST, host.parse()?);
  let stream = tokio::time::timeout(Duration::from_secs(20), transport(&session.target)).await??;
  let (mut sender, connection) =
    hyper::client::conn::http1::handshake(TokioIo::new(stream)).await?;
  let stop = session.stop.clone();
  tokio::spawn(async move {
    tokio::select! { _=stop.cancelled()=>{}, _=connection.with_upgrades()=>{} }
  });
  let mut res = sender.send_request(req).await?;
  if res.status() == StatusCode::SWITCHING_PROTOCOLS {
    let downstream = downstream.context("unexpected upgrade")?;
    let upstream = hyper::upgrade::on(&mut res);
    let stop = session.stop.clone();
    tokio::spawn(async move {
      if let Ok((local, remote)) = tokio::try_join!(downstream, upstream) {
        let (mut local, mut remote) = (TokioIo::new(local), TokioIo::new(remote));
        tokio::select! {_=stop.cancelled()=>{},_=tokio::io::copy_bidirectional(&mut local,&mut remote)=>{}}
      }
    });
  }
  Ok(res.map(Body::new))
}
pub fn http_target(address: &str) -> Result<Target> {
  let mut url = url::Url::parse(address)?;
  ensure!(
    matches!(url.scheme(), "http" | "https")
      && url.has_host()
      && url.username().is_empty()
      && url.password().is_none()
      && url.query().is_none()
      && url.fragment().is_none(),
    "Expected an HTTP(S) server address"
  );
  let path = url.path().trim_end_matches('/');
  if !path.ends_with("/api") {
    url.set_path(&format!("{path}/api"));
  }
  Ok(Target::Http(url))
}

#[cfg(test)]
mod tests {
  use super::*;
  use tokio::io::{AsyncReadExt, AsyncWriteExt};

  async fn call(host: &str, path: &str, origin: &str) -> String {
    let mut tcp = TcpStream::connect(host).await.unwrap();
    tcp.write_all(format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nOrigin: {origin}\r\nCookie: device-only=test\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
    let mut out = String::new();
    tcp.read_to_string(&mut out).await.unwrap();
    out
  }

  #[tokio::test]
  async fn only_the_current_local_app_session_reaches_the_configured_backend() {
    let api = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let target = format!("http://{}/mount", api.local_addr().unwrap());
    let bridge = Bridge::start().await.unwrap();
    bridge.install(http_target(&target).unwrap());
    let first = bridge.base().unwrap();
    bridge.install(http_target(&target).unwrap());
    let url = url::Url::parse(&bridge.base().unwrap()).unwrap();
    let old = url::Url::parse(&first).unwrap();
    let host = &bridge.authority;
    assert!(
      call(host, old.path(), "tauri://localhost")
        .await
        .starts_with("HTTP/1.1 403")
    );
    assert!(
      call(host, url.path(), "https://unrelated.invalid")
        .await
        .starts_with("HTTP/1.1 403")
    );
    let server = tokio::spawn(async move {
      let (mut socket, _) = api.accept().await.unwrap();
      let mut bytes = Vec::new();
      while !bytes.ends_with(b"\r\n\r\n") {
        bytes.push(socket.read_u8().await.unwrap());
      }
      let request = String::from_utf8(bytes).unwrap().to_lowercase();
      assert!(request.starts_with("get /mount/api/version?source=app http/1.1"));
      assert!(!request.contains("cookie:") && !request.contains("origin:"));
      socket
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nSet-Cookie: upstream=x\r\n\r\nwish")
        .await
        .unwrap();
    });
    let res = call(
      host,
      &format!("{}/version?source=app", url.path()),
      "tauri://localhost",
    )
    .await;
    assert!(res.ends_with("wish") && !res.to_lowercase().contains("set-cookie"));
    assert!(res.contains("tauri://localhost"));
    server.await.unwrap();
    bridge.close();
    assert!(
      call(host, url.path(), "tauri://localhost")
        .await
        .starts_with("HTTP/1.1 401")
    );
  }
  #[tokio::test]
  async fn streams_events_and_relays_upgraded_bytes_in_both_directions() {
    let api = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let bridge = Bridge::start().await.unwrap();
    bridge.install(http_target(&format!("http://{}", api.local_addr().unwrap())).unwrap());
    let base = url::Url::parse(&bridge.base().unwrap()).unwrap();
    let (release, wait) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
      let (mut sse, _) = api.accept().await.unwrap();
      read_head(&mut sse).await;
      sse.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: ready\n\n").await.unwrap();
      wait.await.unwrap();
      drop(sse);
      let (mut ws, _) = api.accept().await.unwrap();
      assert!(
        read_head(&mut ws)
          .await
          .to_ascii_lowercase()
          .contains("upgrade: websocket")
      );
      ws.write_all(
        b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      )
      .await
      .unwrap();
      let mut ping = [0; 4];
      ws.read_exact(&mut ping).await.unwrap();
      assert_eq!(&ping, b"ping");
      ws.write_all(b"pong").await.unwrap();
    });
    tokio::time::timeout(Duration::from_secs(5),async {
        let mut sse=TcpStream::connect(&bridge.authority).await.unwrap();
        sse.write_all(format!("GET {}/events HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",base.path(),bridge.authority).as_bytes()).await.unwrap();
        assert!(read_head(&mut sse).await.contains("200 OK"));
        let mut event=Vec::new();while !event.ends_with(b"data: ready\n\n") {event.push(sse.read_u8().await.unwrap())}
        release.send(()).unwrap();
        let mut ws=TcpStream::connect(&bridge.authority).await.unwrap();
        ws.write_all(format!("GET {}/sessions/id/terminal/socket HTTP/1.1\r\nHost: {}\r\nOrigin: tauri://localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",base.path(),bridge.authority).as_bytes()).await.unwrap();
        assert!(read_head(&mut ws).await.contains("101 Switching Protocols"));
        ws.write_all(b"ping").await.unwrap();
        let mut out=[0;4];ws.read_exact(&mut out).await.unwrap();assert_eq!(&out,b"pong");
        server.await.unwrap();
    }).await.expect("local streams should make progress before EOF");
  }
  async fn read_head(socket: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    while !bytes.ends_with(b"\r\n\r\n") {
      bytes.push(socket.read_u8().await.unwrap());
    }
    String::from_utf8(bytes).unwrap()
  }
}
