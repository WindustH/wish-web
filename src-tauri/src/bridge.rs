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
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::device_proxy;
pub enum Target {
  Ssh(SshHandle, u16),
  Http(url::Url),
}
struct Session {
  secret: String,
  views: RwLock<std::collections::HashMap<String, std::time::Instant>>,
  target: Target,
  stop: CancellationToken,
}
#[derive(Clone)]
pub struct Bridge {
  authority: String,
  pub proxy: Option<url::Url>,
  current: Arc<RwLock<Option<Arc<Session>>>>,
}
impl Bridge {
  pub async fn start(proxy: Option<url::Url>) -> Result<Self> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let bridge = Self {
      proxy,
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
    let views = old.views.read().unwrap().clone();
    old.stop.cancel();
    *current = Some(Arc::new(Session {
      secret: old.secret.clone(),
      views: RwLock::new(views),
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
      views: Default::default(),
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
  let request_host = req
    .headers()
    .get(header::HOST)
    .and_then(|h| h.to_str().ok())
    .unwrap_or("");
  let preview = request_host
    .split_once(".localhost:")
    .is_some_and(|(label, port)| {
      label
        .strip_prefix("ws-")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit()))
        && bridge
          .authority
          .rsplit_once(':')
          .is_some_and(|(_, p)| p == port)
    });
  if preview {
    let Some(session) = bridge.current.read().unwrap().clone() else {
      return StatusCode::UNAUTHORIZED.into_response();
    };
    let granted = request_host.split('.').next().is_some_and(|label| {
      session
        .views
        .read()
        .unwrap()
        .get(label)
        .is_some_and(|end| *end > std::time::Instant::now())
    });
    if !granted {
      return StatusCode::GONE.into_response();
    }
    let path = req
      .uri()
      .path_and_query()
      .map_or("/", |p| p.as_str())
      .to_string();
    return match forward(&session, req, path, bridge.proxy.as_ref(), true).await {
      Ok(res) => res,
      Err(_) => StatusCode::BAD_GATEWAY.into_response(),
    };
  }
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
  let opening_view = req.method() == Method::POST
    && suffix.starts_with("/sessions/")
    && suffix.ends_with("/website")
    && suffix.contains("/blobs/");
  let closing_view = (req.method() == Method::DELETE)
    .then(|| {
      suffix
        .rsplit_once("/website/")
        .map(|(_, label)| label.to_owned())
    })
    .flatten();
  let mut res = if req.method() == Method::OPTIONS {
    StatusCode::NO_CONTENT.into_response()
  } else {
    match forward(&session, req, path, bridge.proxy.as_ref(), false).await {
      Ok(res) => res,
      Err(_) => StatusCode::BAD_GATEWAY.into_response(),
    }
  };
  if opening_view
    && res.status().is_success()
    && let Some(label) = res
      .headers()
      .get("x-wish-site")
      .and_then(|v| v.to_str().ok())
    && label
      .strip_prefix("ws-")
      .is_some_and(|id| id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit()))
  {
    let now = std::time::Instant::now();
    let mut views = session.views.write().unwrap();
    views.retain(|_, until| *until > now);
    views.insert(label.to_owned(), now + Duration::from_secs(3600));
  }
  if res.status().is_success()
    && let Some(label) = closing_view
  {
    session.views.write().unwrap().remove(&label);
  }
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
async fn transport(
  target: &Target,
  preview_origin: Option<&url::Url>,
  proxy: Option<&url::Url>,
) -> Result<device_proxy::Socket> {
  match target {
    Target::Ssh(h, port) => Ok(Box::new(
      h.channel_open_direct_tcpip("localhost", u32::from(*port), "127.0.0.1", 0)
        .await?
        .into_stream(),
    )),
    Target::Http(url) => {
      let url = preview_origin.unwrap_or(url);
      let host = url
        .host_str()
        .context("missing host")?
        .trim_matches(['[', ']']);
      let tcp = device_proxy::connect(
        proxy,
        host,
        url.port_or_known_default().context("missing port")?,
      )
      .await?;
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
        Ok(tcp)
      }
    }
  }
}
async fn forward(
  session: &Session,
  mut req: Request,
  path: String,
  proxy: Option<&url::Url>,
  preview: bool,
) -> Result<Response> {
  let (host, base) = match &session.target {
    Target::Ssh(_, port) => (format!("localhost:{port}"), "/api"),
    Target::Http(url) => (
      url[url::Position::BeforeHost..url::Position::AfterPort].to_owned(),
      url.path().trim_end_matches('/'),
    ),
  };
  *req.uri_mut() = if preview {
    path.parse()?
  } else {
    format!("{base}{path}").parse()?
  };
  let upgrade = req
    .headers()
    .get(header::UPGRADE)
    .is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"websocket"));
  let downstream = upgrade.then(|| hyper::upgrade::on(&mut req));
  let req_bootstrap = req.uri().path().starts_with("/.wish-open/");
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
    if !preview || !matches!(name, "origin" | "cookie") {
      h.remove(name);
    }
  }
  let mut preview_origin = None;
  if preview
    && let Target::Http(url) = &session.target
    && let Some(url::Host::Domain(domain)) = url.host()
    && !domain.eq_ignore_ascii_case("localhost")
  {
    let local = h
      .get(header::HOST)
      .context("missing preview host")?
      .to_str()?;
    let label = local.split_once('.').context("invalid preview host")?.0;
    let mut upstream = url.clone();
    upstream.set_host(Some(&format!("{label}.{domain}")))?;
    let authority =
      HeaderValue::from_str(&upstream[url::Position::BeforeHost..url::Position::AfterPort])?;
    // The client-facing origin remains HTTP loopback even when the remote
    // gateway uses TLS. Preserve the cookie options appropriate for that hop.
    if let Some(origin) = h.get(header::ORIGIN) {
      ensure!(
        origin == format!("http://{local}").as_str(),
        "invalid preview origin"
      );
      h.insert(
        header::ORIGIN,
        upstream.origin().ascii_serialization().parse()?,
      );
    }
    if req_bootstrap {
      h.insert("x-wish-preview-loopback", HeaderValue::from_static("1"));
    }
    h.insert(header::HOST, authority);
    preview_origin = Some(upstream);
  }
  if !preview {
    h.insert(header::HOST, host.parse()?);
  } else {
    h.remove(header::AUTHORIZATION);
  }
  let stream = tokio::time::timeout(
    Duration::from_secs(20),
    transport(&session.target, preview_origin.as_ref(), proxy),
  )
  .await??;
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
  use tokio::net::TcpStream;

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
    let bridge = Bridge::start(None).await.unwrap();
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
    let bridge = Bridge::start(None).await.unwrap();
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

#[cfg(test)]
mod preview_tests {
  use super::*;

  #[tokio::test]
  async fn http_preview_uses_remote_virtual_host_and_origin() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let upstream = tokio::spawn(async move {
      let (io, _) = listener.accept().await.unwrap();
      let service = hyper::service::service_fn(
        move |req: hyper::Request<hyper::body::Incoming>| async move {
          let observed = format!(
            "{} {} {}",
            req.headers()[header::HOST].to_str().unwrap(),
            req.headers()[header::ORIGIN].to_str().unwrap(),
            req.uri()
          );
          Ok::<_, std::convert::Infallible>(Response::new(Body::from(observed)))
        },
      );
      let _ = tx.send(());
      let _ = hyper::server::conn::http1::Builder::new()
        .serve_connection(TokioIo::new(io), service)
        .await;
    });
    let label = "ws-0123456789abcdef0123456789abcdef";
    let session = Session {
      secret: String::new(),
      views: Default::default(),
      stop: CancellationToken::new(),
      target: http_target(&format!("http://wish.localhost:{port}/base/api")).unwrap(),
    };
    let req = Request::builder()
      .header(header::HOST, format!("{label}.localhost:8888"))
      .header(header::ORIGIN, format!("http://{label}.localhost:8888"))
      .body(Body::empty())
      .unwrap();
    let result = forward(&session, req, "/assets/page".into(), None, true)
      .await
      .unwrap();
    let body = axum::body::to_bytes(result.into_body(), 1024)
      .await
      .unwrap();
    let target = format!("{label}.wish.localhost:{port}");
    assert_eq!(
      &body[..],
      format!("{target} http://{target} /assets/page").as_bytes()
    );
    rx.await.unwrap();
    session.stop.cancel();
    upstream.await.unwrap();
  }
}
