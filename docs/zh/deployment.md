# 部署

[文档目录](README.md) · [English](../en/deployment.md)

Wish Web 由一个静态单页应用和 `serve.ts` 组成。`serve.ts` 是一个不依赖任何第三方包的小型 Node.js 服务器，负责提供构建好的文件，并把 `/api` 转发给 Wish 服务端。此外还需要一个正在运行的 Wish 服务端，见 [Wish 服务端说明](https://github.com/WindustH/wish-core#readme)。

## 构建

需要 Node.js 22.19 或更高版本，并启用 Corepack。

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
```

构建会先做类型检查，然后把应用输出到 `dist/`，其中包括 Service Worker（`sw.js`、`workbox-*.js`）和 Web 应用清单。

## 部署哪些文件

把 `serve.ts` 和 `dist/` 放在同一个目录下即可，不需要 `node_modules`。`serve.ts` 会在自己所在的目录中查找 `dist/`，如果缺少 `dist/index.html`，启动时就会直接退出。

```sh
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
# wish-web listening on 127.0.0.1:8790; wish API routes enabled
```

应用必须部署在站点根路径下（`https://wish.example.com/`，而不是某个子路径），因为清单、Service Worker 的作用域和图标路径都以 `/` 为准。

## 环境变量

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `PORT` | `8790` | 监听端口。 |
| `LISTEN_HOST` | `127.0.0.1` | 监听地址。监听所有网卡用 `0.0.0.0`（或 `::`）。它不会自动加入允许的主机名。 |
| `ALLOWED_HOSTS` | 空 | 额外允许的 `Host` 请求头，用逗号分隔，例如 `192.168.1.20:8790,wish.example.com`。精确匹配，不区分大小写。 |
| `WISH_UPSTREAM` | `http://127.0.0.1:9780` | Wish 服务端地址。会在后面拼上 `/api`，并保留路径前缀（`http://host/base` → `http://host/base/api`）。只接受 `http` 和 `https`。 |
| `WISH_HTTP_TOKEN` | 空 | Wish 服务端的访问令牌。服务端配置了 `bearer_token_env` 时必须设置。 |

`serve.ts` 不读取其他任何配置。

## 安全机制

每个请求在读取文件或转发之前，都要先通过以下检查：

- **主机名白名单。** 允许的主机名为 `127.0.0.1:PORT`、`localhost:PORT`、`[::1]:PORT`，以及 `ALLOWED_HOSTS` 中列出的值。`PORT` 为 `80` 时，还允许不带端口的 `127.0.0.1`、`localhost` 和 `[::1]`，因为浏览器会省略默认端口。IPv6 地址要写在方括号里（`[fd00::20]:8790`）。其他主机名一律返回 `421 {"error":"rejected","detail":"unexpected host"}`，以此防御 DNS 重绑定攻击。
- **跨站写操作。** 对于 `POST`、`PUT`、`PATCH` 和 `DELETE`，如果 `Origin` 请求头不是 `http://<Host>` 或 `https://<Host>`，或者 `Sec-Fetch-Site` 不是 `same-origin` 或 `none`，就返回 `403`。
- **令牌注入。** 设置了 `WISH_HTTP_TOKEN` 时，每个转发的请求都会带上 `Authorization: Bearer <令牌>`，并覆盖浏览器发来的同名请求头；浏览器始终拿不到这个令牌（[直接连接其他服务器](#直接连接其他服务器)时除外）。没有设置时，浏览器自己的 `Authorization` 请求头（通常没有）会原样转发。
- **转发。** 转发时会去掉 `Origin`、`Referer`、`Sec-Fetch-*` 和 `Accept-Encoding`，并把 `Host` 改为上游地址。响应（包括事件流）不经缓冲直接透传；浏览器断开连接时，上游连接也会随之关闭。连不上 Wish 服务端时返回 `502 {"error":"upstream_unreachable"}`。
- **静态文件。** 请求路径无法跳出 `dist/`。没有扩展名的未知路径一律返回 `index.html`。
- **健康检查。** `GET /healthz` 返回 `{"ok":true}`。它同样要通过主机名检查，而且不反映 Wish 服务端的状态；要检查整条链路，请访问 `/api/version`。

`serve.ts` 本身没有登录机制。任何能以允许的主机名访问它的人，都能完整地使用 Wish 服务端，包括智能体的 Shell，而 Shell 以 Wish 进程的权限执行命令。请只在本机回环地址或可信网络上提供服务，或者在前面的反向代理中加上身份验证。

## 在局域网中访问

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.1.20:8790 \
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
```

把大家在浏览器里输入的每个地址（IP 或主机名，带端口）都加进去。Wish 服务端本身仍然只监听 `127.0.0.1`。通过普通 HTTP 访问时应用可以正常使用，但下一节列出的功能都不可用。

## 通过反向代理启用 HTTPS

有些功能浏览器只在“安全上下文”中开放，即 HTTPS，或 `http://localhost` / `127.0.0.1`。如果通过 `http://192.168.1.20:8790` 访问：

| 功能 | 非安全上下文中的情况 |
| --- | --- |
| Service Worker：快速启动、更新提示 | 不会注册；需要刷新页面才能用上新版本 |
| 安装为应用 | 不提供 |
| 运行失败通知 | 无法获得通知权限 |
| 保持屏幕唤醒 | 不起作用 |
| 剪贴板 | 退回到旧的复制方式 |

`serve.ts` 不支持 TLS，需要在前面加一层反向代理。以能自动申请证书的 [Caddy](https://caddyserver.com) 为例：

```caddyfile
wish.example.com {
	reverse_proxy 127.0.0.1:8790
}
```

```sh
LISTEN_HOST=127.0.0.1 ALLOWED_HOSTS=wish.example.com node serve.ts
```

- `ALLOWED_HOSTS` 中填写**不带端口**的公开域名：走 443 端口时，浏览器发送的是 `Host: wish.example.com`。如果对外使用其他端口，就写成“域名:端口”。
- 反向代理必须原样转发 `Host` 和 `Origin` 请求头，否则所有保存和发送操作都会被 `403` 拒绝。Caddy 默认就是如此。使用 nginx 时要设置 `proxy_set_header Host $http_host;`（它默认会改写 `Host`），并加上 `proxy_buffering off;`，以免事件流被缓冲。
- 如果域名只在内网使用，可以用 Caddy 的 `tls internal` 由它自己的证书颁发机构签发证书，但每台设备都需要信任这个颁发机构。

## 直接连接其他服务器

除了提供页面的这台服务器，应用还可以直接连接任何其他 Wish 服务器：退出后，在登录页填写那台服务器的地址和访问令牌即可。这样一处部署或一个安装好的应用就能在多台服务器之间切换。此时请求不再经过 `serve.ts`，它的检查和令牌注入都不起作用：

- 对方服务器必须设置访问令牌（`bearer_token_env`）。只有这样它才接受来自其他来源页面的请求；没有令牌的服务器会拒绝。
- 通过 HTTPS 打开的页面只能连接 HTTPS 地址（本机 `http://localhost` 除外），因此请通过反向代理以 HTTPS 发布对方服务器，并关闭 `/api` 的响应缓冲。
- 令牌保存在浏览器的 `localStorage` 中，直到退出为止。

## 作为服务运行

一个 systemd 用户服务单元 `~/.config/systemd/user/wish-web.service` 示例：

```ini
[Unit]
Description=Wish Web
Wants=wish.service
After=wish.service

[Service]
WorkingDirectory=%h/opt/wish-web
Environment=PORT=8790
Environment=LISTEN_HOST=127.0.0.1
Environment=WISH_UPSTREAM=http://127.0.0.1:9780
# 在一个只有你能读取的文件中写 WISH_HTTP_TOKEN=...
EnvironmentFile=-%h/.config/wish/web.env
ExecStart=/usr/bin/node serve.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now wish-web
loginctl enable-linger "$USER"   # 未登录时也保持运行
```

`ExecStart` 请填 Node.js 的绝对路径（`command -v node` 可以查到）。用户服务不会加载 shell 的配置文件，版本管理工具设置的 `PATH` 在这里无效。`Wants=`/`After=wish.service` 假定 Wish 服务端也以名为 `wish.service` 的用户服务运行。

## 缓存与更新

| 路径 | `Cache-Control` |
| --- | --- |
| `/assets/*`（文件名中含内容哈希） | `public, max-age=31536000, immutable` |
| `dist/` 中的其他文件（`index.html`、`sw.js`、清单、图标） | `no-cache` |
| `/api/*` | 由 Wish 服务端决定 |
| `serve.ts` 拒绝的请求（`421`、`403`） | `no-store` |

部署新版本之后：

- **有 Service Worker 时**（HTTPS 或 localhost），已打开的页面会提示“新版本已就绪”。Wish 会在页面重新可见时，以及与服务端的连接恢复时（`serve.ts` 重启就会触发）检查更新，每五分钟最多一次。点击“立即更新”即切换到新版本。
- **没有 Service Worker 时**（普通 HTTP），刷新页面即可。部署前就开着的页面也请刷新，否则打开尚未加载过的页面时，可能会请求新版本中已经不存在的文件。

会话信息中的“构建”显示当前客户端构建自哪个提交。

## 升级与回滚

把每次构建放进独立的目录，再用一个符号链接指向当前版本：

```sh
./pnpmw install --frozen-lockfile && ./pnpmw build
release=~/opt/.wish-web-releases/$(date +%Y%m%d-%H%M)
mkdir -p "$release" && cp -r dist serve.ts "$release"/
ln -sfn "$release" ~/opt/wish-web.next && mv -T ~/opt/wish-web.next ~/opt/wish-web
systemctl --user restart wish-web
```

`mv -T` 能原子地替换符号链接。回滚时，用同样的方法把 `~/opt/wish-web` 指回上一个版本并重启即可。客户端不在服务器上保存任何数据，因此可以随意切换版本。
