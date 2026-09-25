# 架构

[文档目录](README.md) · [English](../en/architecture.md)

## 分层结构

```text
页面            features/*  ui/*
  │
状态模块        core/state：sessions · chat · stats · sync · prefs
  │
API 层          core/api：endpoints.ts → client.ts、sse.ts；projections.ts
  │             （platform/* 适配层和 Service Worker 与之并列）
  │  同源：静态文件和 /api
serve.ts       主机名与来源检查、令牌注入、/api 代理
  │  /api，附带 Authorization: Bearer <令牌>
wish            HTTP API · 会话 · 提供商 · SQLite   （wish-core）
```

- **页面**负责渲染和处理输入，从状态模块读取数据，通过 API 层发起请求。
- **状态模块**是模块级的单例，由 Vue 的 ref 组成：`sessions` 管理会话列表，`chat` 管理当前打开的会话（历史、实时输出、队列、草稿），`stats` 对应统计页，`sync` 维护全局事件流，`prefs` 保存界面开关。
- **API 层**：`endpoints.ts` 为每个服务端接口提供一个函数；`client.ts` 负责发请求，带 30 秒超时，并把各种失败统一成一种错误类型；`sse.ts` 读取事件流；`projections.ts` 把服务端的原生数据结构（外部标记的消息、`{session, status}` 对）转换成页面使用的扁平对象，例如把会话阶段归为空闲、运行中、排队或压缩中。
- **连接**：`core/connection.ts` 决定 API 层连接哪台服务器。默认是页面自身的 `/api`，由 `serve.ts` 代理。退出并连接其他服务器后，保存的地址成为 API 基址，`client.ts` 会给每个请求、事件流和附件下载（`apiFetch`、`ApiImage`）加上访问令牌，因为此时浏览器直接访问那台服务器。
- **平台适配层**把浏览器 API 封装成小接口。启动时注册浏览器实现；如果将来有原生外壳，可以注册自己的实现。
- **路由**使用 URL 的 hash（`/#/s/<id>`），因此任何静态托管都能用，无需配置重写规则。桌面端的会话信息、历史搜索和会话设置是浮在对话上方的对话框；手机上则是子路由（`/#/s/<id>/info`、`/search`、`/settings`）。

## 实时更新

| 通道 | 用途 |
| --- | --- |
| `GET /api/events`（始终连接） | `snapshot` 和 `gap`：重新读取会话列表。`session_changed`：重新读取该会话。`session_deleted`：移除该会话。`configuration_changed`：重新读取起始页的默认模型和模型目录，并重新检查是否有可用的提供商。连接断开期间显示“离线模式: API 不可用”横幅。 |
| `GET /api/sessions/{id}/events`（仅当前对话） | 流式的文字、思考和工具调用增量，作为实时预览显示。重连后，第一条 `snapshot` 记录会重建当前这一轮的输出。 |
| 每 5 秒轮询一次（仅当前对话） | 重新读取会话、更新的历史和队列，作为事件流的兜底。 |

- 两个事件流都用 `fetch` 读取，而不是 `EventSource`。这样客户端能拿到 HTTP 状态码、能带请求头，也能自己控制重连：退避时间从 0.5 秒指数增长到 15 秒并加入随机抖动；60 秒收不到任何数据就重连；遇到 `401`/`403`（令牌错误）或 `404`/`410`（会话已不存在）不再重试。
- 以持久化的历史为准。运行结束后，客户端读取更新的历史页，实时预览随之换成已保存的消息。历史按每页 40 条、以序号作为游标分页读取，从不一次读完；跳转到搜索结果时，会读取该位置前后的页。
- 重连只会重新读取状态，不会重发消息，也不会重复任何请求。

## 各功能调用的接口

| 功能 | 请求 |
| --- | --- |
| 启动检查 | `GET /api/config`（是否有可用的提供商） |
| 会话列表 | `GET /api/sessions?start&limit&order&query` |
| 起始页 | `GET /api/defaults`、`GET /api/providers`、`GET /api/providers/{id}/models`、`GET /api/directories?path=`、`POST /api/sessions`、`PUT /api/config`（记住默认模型） |
| 对话 | `GET /api/sessions/{id}`、`GET …/history`、`GET …/queue` 和 `…/entries`、`GET …/events`、`POST …/blobs`、`POST …/input`、`POST …/interrupt`、`GET …/blobs/{hash}` |
| 队列 | `PATCH` 和 `DELETE …/queue/{entry}` |
| 切换模型或推理强度 | `PATCH /api/sessions/{id}`，带 `provider` 和 `config`，并用 `If-Match` 保护 |
| BTW | `POST …/ask`，`stream: true` |
| 历史搜索 | `POST …/history/search` |
| 会话信息 | `GET …/usage`、`…/usage/series`、`…/usage/daily` |
| 会话设置 | `PATCH /api/sessions/{id}`（`config`，`If-Match`）、`PUT …/shell`、`POST …/compact`、`POST …/context/clear`、`GET /api/defaults`、`/api/shells`、`/api/config` |
| 重命名、标签、删除 | `PATCH /api/sessions/{id}`（`name`；带 `If-Match` 的 `metadata`）、`DELETE /api/sessions/{id}` |
| 统计 | `GET /api/status`、`/api/usage?from_ms&to_ms`、`/api/storage`、`/api/version`、`/api/usage/series`、`/api/usage/daily` |
| 设置 | `GET` 和 `PUT /api/config`、`GET /api/provider-presets`、`/api/proxy-environment`、`/api/shells`、`/api/providers/{id}/models`、`POST` 和 `GET /api/providers/{id}/chatgpt-login`、`POST …/chatgpt-login/complete` |
| 首次配置 | `GET /api/config`、`/api/provider-presets`、`PUT /api/config` |
| 自检 | `GET /api/version`、`/api/sessions?limit=1`、`/api/providers`、`/api/events` |

表中的 `…` 代表 `/api/sessions/{id}`。路由和数据格式详见服务端的 [API 参考](https://github.com/WindustH/wish-core/blob/master/docs/api.md)。

## 缓存

| 层 | 缓存内容 | 有效期 |
| --- | --- | --- |
| `KeepAlive` | 最多四个顶层页面保持挂载，保留滚动位置和表单状态 | 直到刷新页面 |
| 响应缓存（`core/util/responseCache.ts`） | 统计、用量图表、模型目录和提供商名称的最近一次响应，存放在内存（32 条）和 IndexedDB 中，按服务端区分 | 直到“清除本地数据” |
| 提供商检查 | 该服务端上次是否已有可用的提供商（`localStorage`），这样打开应用时无需等待；检查仍会照常进行，结果变了就切换到首次配置 | 直到结果改变 |
| Service Worker | 应用自身的文件，以及用到过的字体 | 直到新版本启用 |

页面会先显示缓存的数据，新数据到达后再替换。会话历史、会话状态和配置始终实时读取。单个会话的用量图表只缓存在内存中。

## Service Worker 与 PWA

Service Worker 由 `vite-plugin-pwa` 借助 Workbox 生成：

- 预缓存应用的 JavaScript、CSS、HTML、图片和清单。字体在首次使用时才缓存（`wish-fonts`，最多 180 个文件，保留一年），因此体积很大的中文字体不会被整体下载。
- 页面导航请求一律返回 `index.html`，但 `/api` 和 `/healthz` 始终走网络。
- 更新方式为 `prompt`：新的 Worker 会一直等到用户点击“立即更新”。由于 hash 路由从不重新加载页面，应用会在页面重新可见时和事件流重连时主动让浏览器检查新的 Worker，每五分钟最多一次。
- 只在安全上下文中注册，开发服务器上也不注册。

清单文件（`public/manifest.webmanifest`）设置了独立窗口显示、启动地址 `/#/sessions` 和图标。

## 多语言

- `core/i18n/zh.ts` 和 `en.ts` 包含相同的键，通过 `i18n.t(key, params)` 查找，缺失时回退到英文。只在一处出现的文字直接写成 `tr('中文', 'English')`。
- 界面语言默认为中文，保存在 `localStorage` 中，并同步设置 `<html lang>`。不会根据浏览器语言自动选择。
- `core/i18n/errorMessages.ts` 负责在错误对话框中翻译服务端的错误信息。
- 自检页面的详细信息目前只有中文。

主题的处理方式类似：“跟随系统”“浅色”或“深色”，保存在本地，以 `data-theme` 属性应用到 `<html>` 上，同时设置浏览器的主题色。
