// SSH transport for a device-local Wish Web. Each login owns one connection, shared by its
// HTTP requests and WebSocket channels. Only the browser signs with a browser-managed key.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Agent } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import type { IdentityCallback, SignCallback, SigningRequestOptions, ConnectConfig } from 'ssh2';

const { Client, BaseAgent } = ssh2;
const cookieName = 'wish_ssh_session';
const apiPort = Number(process.env.WISH_SSH_API_PORT || 9780);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid WISH_SSH_API_PORT');
export const apiUrl = new URL(`http://127.0.0.1:${apiPort}/api`);
const sessions = new Map<string, { agent: Agent; close: () => void }>();
const id = () => randomBytes(32).toString('hex');
const cookieId = (req: IncomingMessage) =>
  /(?:^|;\s*)wish_ssh_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
export const proxyAgent = (req: IncomingMessage) => sessions.get(cookieId(req))?.agent;
const cookie = (value: string) =>
  `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/${value ? '' : '; Max-Age=0'}`;

type Step = { fingerprint: string } | { challenge: string; login: string } | { session: string } | { error: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const pending = new Map<string, { sign: SignCallback; ready: Promise<Step>; close: () => void }>();
let connecting = 0;
async function systemIdentity(): Promise<Pick<ConnectConfig, 'agent' | 'privateKey'>> {
  const path = process.env.WISH_SSH_IDENTITY;
  if (path) return { privateKey: await readFile(path) };
  const agent = process.env.SSH_AUTH_SOCK || undefined;
  for (const name of ['id_ed25519', 'id_ecdsa', 'id_rsa']) {
    try {
      const privateKey = await readFile(join(homedir(), '.ssh', name));
      if (agent && ssh2.utils.parseKey(privateKey) instanceof Error) return { agent };
      return { privateKey, agent };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  if (agent) return { agent };
  throw new Error('No system SSH identity. Select a browser key or set WISH_SSH_IDENTITY.');
}

async function login(input: Record<string, string>, response: ServerResponse): Promise<Step> {
  const address = new URL(input.address.includes('://') ? input.address : 'ssh://' + input.address);
  if (
    address.protocol !== 'ssh:' ||
    !address.hostname ||
    address.password ||
    address.search ||
    address.hash ||
    !['', '/'].includes(address.pathname)
  )
    throw new Error('Expected ssh://host:port');
  const port = Number(address.port || 2222);
  const loginId = id();
  const session = id();
  const challenge = deferred<Step>();
  const ready = deferred<Step>();
  const client = new Client();
  const agent = new Agent({ keepAlive: false });
  // A closed tab can leave an authenticated transport with no channels behind.
  let channels = 0;
  let idle: NodeJS.Timeout;
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => client.destroy(), 30 * 60_000).unref();
  };
  // ssh2's HTTP agent also adapts these TCP-only methods on direct-tcpip streams.
  // Open a channel on the authenticated connection instead of performing a login per request.
  agent.createConnection = (_options, cb) => {
    client.forwardOut('127.0.0.1', 0, 'localhost', apiPort, (err, stream) => {
      if (!err) {
        channels++;
        clearTimeout(idle);
        stream.once('close', () => {
          if (--channels === 0 && sessions.has(session)) armIdle();
        });
        Object.assign(stream, {
          setKeepAlive() {},
          setNoDelay() {},
          setTimeout() {},
          ref() {},
          unref() {},
          destroySoon() {
            stream.close();
          },
        });
      }
      cb?.(err ?? null, stream);
    });
    return undefined;
  };
  class BrowserSigner extends BaseAgent<string> {
    getIdentities(cb: IdentityCallback<string>) {
      cb(null, [input.publicKey]);
    }
    sign(_pub: string, data: Buffer, opts: SigningRequestOptions | SignCallback, cb?: SignCallback) {
      const sign = typeof opts === 'function' ? opts : cb!;
      pending.set(loginId, { sign, ready: ready.promise, close });
      challenge.resolve({ challenge: data.toString('base64'), login: loginId });
    }
  }
  const auth = input.publicKey ? { agent: new BrowserSigner() } : await systemIdentity();
  const close = () => {
    sessions.delete(session);
    clearTimeout(idle);
    agent.destroy();
    client.destroy();
  };
  if (response.destroyed) return { error: 'SSH login cancelled' };
  const cancelled = () => {
    if (!response.writableEnded) close();
  };
  response.once('close', cancelled);
  const timeout = setTimeout(() => {
    ready.resolve({ error: 'SSH login timed out' });
    close();
  }, 30000);
  client.on('error', () => ready.resolve({ error: 'SSH authentication or connection failed' }));
  client.once('close', () => {
    clearTimeout(idle);
    clearTimeout(timeout);
    pending.delete(loginId);
    sessions.delete(session);
    agent.destroy();
    ready.resolve({ error: 'SSH connection closed' });
  });
  client.once('ready', () => {
    clearTimeout(timeout);
    sessions.set(session, { agent, close });
    armIdle();
    ready.resolve({ session });
  });
  try {
    client.connect({
      host: address.hostname.replace(/^\[|\]$/g, ''),
      port,
      username: address.username || 'wish',
      ...auth,
      algorithms: { compress: ['zlib@openssh.com', 'none'] },
      readyTimeout: 25000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier(raw: Buffer) {
        const fingerprint = 'SHA256:' + createHash('sha256').update(raw).digest('base64').replace(/=+$/, '');
        if (input.fingerprint === fingerprint) return true;
        ready.resolve(input.fingerprint ? { error: 'SSH host key has changed' } : { fingerprint });
        return false;
      },
    });
    return await Promise.race([challenge.promise, ready.promise]);
  } catch (error) {
    clearTimeout(timeout);
    close();
    throw error;
  }
}

export async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
  res.setHeader('cache-control', 'no-store');
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (path === '/ssh/status' && req.method === 'GET') return json(200, { enabled: true });
  if (
    req.method !== 'POST' ||
    req.headers.origin !== `http://${req.headers.host}` ||
    req.headers['content-type'] !== 'application/json'
  )
    return json(403, { error: 'Local same-origin JSON request required' });
  if (path === '/ssh/logout') {
    sessions.get(cookieId(req))?.close();
    res.setHeader('set-cookie', cookie(''));
    return json(200, { ok: true });
  }
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) return json(413, { error: 'Login request too large' });
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    let step: Step;
    if (path === '/ssh/login') {
      if (connecting + pending.size >= 16 || sessions.size >= 64) return json(429, { error: 'Too many connections' });
      connecting++;
      try {
        step = await login(input, res);
      } finally {
        connecting--;
      }
    } else if (path === '/ssh/prove') {
      const request = pending.get(input.login);
      if (!request) return json(401, { error: 'SSH login expired' });
      pending.delete(input.login);
      const signature = Buffer.from(input.signature, 'base64');
      if (signature.length !== 64) {
        request.sign(new Error('Invalid signature'));
        return json(400, { error: 'Invalid signature' });
      }
      res.once('close', () => {
        if (!res.writableEnded) request.close();
      });
      request.sign(null, signature);
      step = await request.ready;
    } else return json(404, { error: 'Unknown SSH operation' });
    if ('session' in step) {
      sessions.get(cookieId(req))?.close();
      res.setHeader('set-cookie', cookie(step.session));
      return json(200, { ok: true });
    }
    return json('error' in step ? 401 : 200, step);
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : 'Invalid SSH login' });
  }
}
