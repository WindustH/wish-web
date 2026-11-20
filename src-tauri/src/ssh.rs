use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use russh::{
  Signer, client,
  keys::PublicKeyOrCertificate,
  keys::{Algorithm, HashAlg, PrivateKeyWithHashAlg, PublicKey, agent::AgentIdentity},
};
use serde::{Deserialize, Serialize};
use std::{
  sync::{Arc, Mutex, OnceLock},
  time::Duration,
};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::bridge::{Bridge, Target};
pub type SshHandle = client::Handle<Host>;
pub struct Host {
  pin: String,
  observed: Arc<OnceLock<String>>,
}
impl client::Handler for Host {
  type Error = russh::Error;
  async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
    let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
    let _ = self.observed.set(fingerprint.clone());
    Ok(self.pin == fingerprint)
  }
}

#[derive(Default)]
pub struct Login {
  proof: Mutex<Option<(Uuid, oneshot::Sender<Vec<u8>>)>>,
  busy: tokio::sync::Mutex<()>,
  cancellation: Mutex<tokio_util::sync::CancellationToken>,
}
impl Login {
  pub async fn disconnect(&self, bridge: &Bridge) {
    std::mem::take(&mut *self.cancellation.lock().unwrap()).cancel();
    let _idle = self.busy.lock().await;
    bridge.close();
  }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
  address: String,
  fingerprint: String,
  public_key: String,
  api_port: u16,
  resume_base: Option<String>,
}
#[derive(Serialize, Clone)]
pub struct Challenge {
  id: String,
  data: String,
}
struct BrowserSigner<'a> {
  algorithm: Algorithm,
  login: &'a Login,
  events: tauri::ipc::Channel<Challenge>,
}
impl Signer for BrowserSigner<'_> {
  type Error = anyhow::Error;
  async fn auth_sign(
    &mut self,
    _: &AgentIdentity,
    _: Option<HashAlg>,
    mut data: Vec<u8>,
  ) -> Result<Vec<u8>> {
    let id = Uuid::new_v4();
    let (tx, rx) = oneshot::channel();
    *self.login.proof.lock().unwrap() = Some((id, tx));
    self.events.send(Challenge {
      id: id.to_string(),
      data: STANDARD.encode(&data),
    })?;
    let signature = rx.await?;
    use russh::keys::{
      ssh_encoding::{Encode, Mpint},
      ssh_key::Signature,
    };
    ensure!(signature.len() == 64, "Invalid WebCrypto signature");
    let signature = if matches!(self.algorithm, Algorithm::Ecdsa { .. }) {
      // WebCrypto returns IEEE P1363 r || s. SSH uses two signed mpints.
      let mut parsed = Vec::new();
      let (r, s) = signature.split_at(32);
      Mpint::from_positive_bytes(r).encode(&mut parsed)?;
      Mpint::from_positive_bytes(s).encode(&mut parsed)?;
      parsed
    } else {
      signature
    };
    Signature::new(self.algorithm.clone(), signature)?.encode_prefixed(&mut data)?;
    Ok(data)
  }
}
#[tauri::command]
pub fn ssh_prove(login: tauri::State<Login>, id: String, signature: String) -> Result<(), String> {
  let mut p = login.proof.lock().unwrap();
  if !p.as_ref().is_some_and(|(k, _)| k.to_string() == id) {
    return Err("Expired SSH login".into());
  }
  let bytes = STANDARD.decode(signature).map_err(|e| e.to_string())?;
  p.take()
    .unwrap()
    .1
    .send(bytes)
    .map_err(|_| "Expired SSH login".into())
}
async fn system_login(h: &mut SshHandle, user: &str) -> Result<bool> {
  let explicit = std::env::var_os("WISH_SSH_IDENTITY");
  #[cfg(unix)]
  if explicit.is_none()
    && let Ok(mut agent) = russh::keys::agent::client::AgentClient::connect_env().await
  {
    for identity in agent.request_identities().await? {
      if let AgentIdentity::PublicKey { key, .. } = identity {
        let hash = h.best_supported_rsa_hash().await?.flatten();
        if h
          .authenticate_publickey_with(user, key, hash, &mut agent)
          .await?
          .success()
        {
          return Ok(true);
        }
      }
    }
  }
  let path = explicit
    .map(std::path::PathBuf::from)
    .or_else(|| {
      let dir = dirs::home_dir()?.join(".ssh");
      ["id_ed25519", "id_ecdsa", "id_rsa"]
        .iter()
        .map(|k| dir.join(k))
        .find(|p| p.is_file())
    })
    .context("No system identity. Generate a Wish key, or set WISH_SSH_IDENTITY.")?;
  let key = russh::keys::load_secret_key(path, None)?;
  let hash = h.best_supported_rsa_hash().await?.flatten();
  Ok(
    h.authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
      .await?
      .success(),
  )
}
async fn connect(
  bridge: &Bridge,
  login: &Login,
  input: Input,
  events: tauri::ipc::Channel<Challenge>,
) -> Result<serde_json::Value> {
  let text = if input.address.contains("://") {
    input.address
  } else {
    format!("ssh://{}", input.address)
  };
  let url = url::Url::parse(&text)?;
  ensure!(
    url.scheme() == "ssh"
      && url.password().is_none()
      && ["", "/"].contains(&url.path())
      && url.query().is_none()
      && url.fragment().is_none()
      && input.api_port != 0,
    "Expected ssh://host:port"
  );
  let observed = Arc::new(OnceLock::new());
  let config = client::Config {
    keepalive_interval: Some(Duration::from_secs(15)),
    preferred: russh::Preferred {
      compression: std::borrow::Cow::Borrowed(&[
        russh::compression::ZLIB_LEGACY,
        russh::compression::NONE,
      ]),
      ..Default::default()
    },
    ..Default::default()
  };
  let result = client::connect(
    Arc::new(config),
    (
      url
        .host_str()
        .context("Missing SSH host")?
        .trim_matches(['[', ']']),
      url.port().unwrap_or(2222),
    ),
    Host {
      pin: input.fingerprint.clone(),
      observed: observed.clone(),
    },
  )
  .await;
  if let Some(fp) = observed.get()
    && input.fingerprint != *fp
  {
    if input.fingerprint.is_empty() {
      return Ok(serde_json::json!({"fingerprint":fp}));
    }
    bail!("SSH host key has changed")
  }
  let mut handle = result?;
  let user = if url.username().is_empty() {
    "wish"
  } else {
    url.username()
  };
  let ok = if input.public_key.is_empty() {
    system_login(&mut handle, user).await?
  } else {
    let key = PublicKey::from_openssh(&input.public_key)?;
    ensure!(
      matches!(
        key.algorithm(),
        Algorithm::Ed25519
          | Algorithm::Ecdsa {
            curve: russh::keys::EcdsaCurve::NistP256
          }
      ),
      "Expected an Ed25519 or P-256 browser key"
    );
    let algorithm = key.algorithm();
    handle
      .authenticate_publickey_with(
        user,
        key,
        None,
        &mut BrowserSigner {
          algorithm,
          login,
          events,
        },
      )
      .await?
      .success()
  };
  ensure!(ok, "SSH public key was not accepted");
  if let Some(base) = input.resume_base {
    bridge.resume_ssh(&base, handle, input.api_port)?;
  } else {
    bridge.install(Target::Ssh(handle, input.api_port));
  }
  Ok(serde_json::json!({"ok":true}))
}
#[tauri::command]
pub async fn ssh_login(
  bridge: tauri::State<'_, Bridge>,
  login: tauri::State<'_, Login>,
  input: Input,
  events: tauri::ipc::Channel<Challenge>,
) -> Result<serde_json::Value, String> {
  let cancellation = login.cancellation.lock().unwrap().clone();
  let _guard = login.busy.try_lock().map_err(|_| "SSH login in progress")?;
  let attempt = tokio::time::timeout(
    Duration::from_secs(30),
    connect(&bridge, &login, input, events),
  );
  let result = tokio::select! {
    biased;
    _ = cancellation.cancelled() => Err(String::from("SSH login cancelled")),
    result = attempt => result.map_err(|_| String::from("SSH login timed out")).and_then(|r| r.map_err(|e| e.to_string())),
  };
  login.proof.lock().unwrap().take();
  result
}
