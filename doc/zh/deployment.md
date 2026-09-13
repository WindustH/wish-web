# 部署

[文档目录](README.md) · [English](../en/deployment.md)

运行 `./pnpmw build` 后，将 `dist/` 和 `serve.mjs` 复制到不可变发布目录，使用 `node serve.mjs` 启动。分发应用时一并包含 `THIRD_PARTY.md` 和 `doc/`。

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `PORT` | `8790` | HTTP 端口 |
| `LISTEN_HOST` | `127.0.0.1` | 监听接口 |
| `ALLOWED_HOSTS` | 环回地址 | 额外允许的 `主机:端口`，以逗号分隔 |
| `WISHD_UPSTREAM` | `http://127.0.0.1:9780` | 会话后端地址 |
| `PROVIDERD_UPSTREAM` | `http://127.0.0.1:9781` | 提供商后端地址 |
| `WISHD_TOKEN` | 空 | 只注入会话后端请求的 bearer 令牌 |
| `PROVIDERD_TOKEN` | 空 | 只注入提供商后端请求的 bearer 令牌 |

局域网使用时显式设置监听接口和允许的访问地址：

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.1.20:8790 node serve.mjs
```

Host 白名单不是登录认证。超出可信网络时，应由可信反向代理提供认证和 TLS。内置服务器提供 HTTP，并按 `http://Host` 校验写请求来源；不能假设外层 HTTPS 终止后无需调整代理就可直接使用。也可用其他静态服务器托管 `dist/`，直接实现两个 API 同源代理。

两个上游地址支持 HTTP(S) 和路径前缀。令牌只发送给对应后端。跨源写操作及未允许 Host 会在代理前被拒绝。SSE 应实时转发且不缓冲，浏览器断开后释放上游请求。`/healthz` 检查 Web 服务；两个代理下的 `/health/ready` 分别检查后端。

PWA 更新会先提示，不自动在对话中途激活。Service Worker 不缓存 API，只缓存静态资源，字体分片按需加载。剪贴板、安装、通知和屏幕唤醒受浏览器权限及安全上下文限制，普通局域网 HTTP 下可能不可用。

发布时记录提交和资源哈希。前端单独变更只需原子切换发布目录链接并重启 Web 服务。后端发布应等待运行和后台执行结束，或明确约定中断。保留配置、会话及附件文件。旧发布目录用于程序回滚，不要用旧数据库覆盖已经产生的新用户数据。
