# 架构

[文档目录](README.md) · [English](../en/architecture.md)

## 分层结构

```text
页面            features/*
共享领域展示    domain/{chat,providers,settings,media,diagnostics}
通用 UI         ui/*
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
- **状态模块**是模块级的单例，由 Vue 的 ref 组成：`sessions` 管理会话列表，`chat` 管理当前打开的会话（历史、实时输出、队列、草稿），`stats` 对应统计页，`sync` 维护全局事件流，提供可重复启动的 `start()` / `stop()`；停止会关闭 SSE、取消刷新并隔离迟到回调，`prefs` 保存界面开关。
- **API 层**：`endpoints.ts` 为每个服务端接口提供一个函数；`client.ts` 负责发请求，带 30 秒超时（包括响应体读取），使用可释放的 AbortController 组合调用方取消与超时，不依赖 AbortSignal.any/timeout，并把各种失败统一成一种错误类型；`sse.ts` 读取事件流；`projections.ts` 把服务端的原生数据结构（外部标记的消息、`{session, status}` 对）转换成页面使用的扁平对象，例如把会话阶段归为空闲、运行中、排队或压缩中。
- **连接**：`core/connection.ts` 决定 API 层连接哪台服务器。默认是页面自身的 `/api`，由 `serve.ts` 代理。退出并连接其他服务器后，保存的地址成为 API 基址，`client.ts` 会给每个请求、事件流和附件下载（`apiFetch`、`ApiImage`）加上访问令牌，因为此时浏览器直接访问那台服务器。
- **平台适配层**把浏览器 API 封装成小接口。启动时注册浏览器实现；如果将来有原生外壳，可以注册自己的实现。
- **路由**使用 URL 的 hash（`/#/s/<id>`），因此任何静态托管都能用，无需配置重写规则。桌面端的会话信息、历史搜索和会话设置是浮在对话上方的对话框；手机上则是子路由（`/#/s/<id>/info`、`/search`、`/settings`）。

## 实时更新

### 右侧栏与会话库

`ChatPane` 的标题栏横跨对话与右侧栏，最右侧按钮独立切换侧栏；「库」按钮打开 Library。
对话输入区与消息列表保持挂载，侧栏开关不重建草稿或流式输出。`ui/components/IslandSidebar`
只提供容器、标题与操作插槽，不依赖文件业务，后续内容可复用。

`features/sessions/SessionLibrary` 使用 `GET …/blobs` 分页读取当前会话目录，文件是否出现在库中
不依赖已加载的历史页。历史中的附件名称只补充展示名称。列表含图片缩略图、类型筛选与手动刷新；
未分页且列表可见时每 15 秒更新一次。关闭或切换会话取消请求与计时器，列表按会话隔离。

图片、音视频和 PDF 复用短期单文件播放授权，避免给媒体元素暴露账户访问令牌；音视频保留原生
控件和 Range 请求。文本最多读取前 256 KiB 并以纯文本显示。PDF.js 与 Worker 按需加载，
`domain/media/PdfPreview` 仅渲染当前页并限制画布像素，提供翻页与缩放，关闭时取消渲染和加载。
PDF.js 的字体、字符映射和 WASM 从依赖生成到构建产物，不把二进制文件提交至源码仓库。

桌面栏与对话并排，以单条分割线分隔，不设外边距、圆角或阴影；手机上铺满内容区。系统返回先退出文件预览，再关闭侧栏，随后才返回会话列表。
验证入口：相邻 `wish-test` 中的 `tests.test_wish_library` 与 `web/check-library.mjs`。

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
| 账户状态 | `GET /api/providers`，以及对每个设置了账户查询协议的提供商调用 `GET /api/providers/{id}/account` |
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

- `core/i18n/zh.ts` 和 `en.ts` 包含相同的键，通过 `i18n.t(key, params)` 查找，缺失时回退到英文。新增共享文案使用字典键；既有单处文案仍保留 `tr('中文', 'English')` 作为中英双语兼容入口，尚未全量迁移。
- 界面语言默认跟随浏览器，也可手动选择中文或英文；偏好通过平台存储适配器保存，并同步设置 `<html lang>`。
- `core/i18n/errorMessages.ts` 负责在错误对话框中翻译服务端的错误信息。
- 自检页面的详细信息目前只有中文。

主题的处理方式类似：“跟随系统”“浅色”或“深色”，保存在本地，以 `data-theme` 属性应用到 `<html>` 上，同时设置浏览器的主题色。

### 弹窗与移动端返回的所有权

- `ActivityDialogs` 是会话级活动窗口宿主，位于虚拟消息行之外。行只渲染内容，时间轴和搜索提交打开请求。消息重排或回收不能卸载活动窗口；关闭和切换会话会释放宿主。不要恢复以消息行为单位的全局展开缓存。
- `useDialogLifecycle` 负责打开、关闭中、已关闭三个状态及异步关闭确认。CSS 动画只是视觉效果，关闭超时仍会卸载 Portal；过期确认不能关闭重新打开的窗口。Reka 负责焦点、指针锁和无障碍语义，不直接修改全局锁来补偿组件泄漏。
- `backLayers` 统一持有本地窗口和移动端页面的历史边界。返回先关闭最高层窗口，再由 `pageBackTarget` 决定页面父级；页面返回不能混入弹窗的批量关闭回调。
- `useMobileBackNavigation` 负责首页退出确认。浏览器没有通用的 PWA 关闭接口：有前序浏览器页面时返回该页面；独立启动时确认后回到历史边界，由下一次系统返回退出。

验证入口：`tools/dialog-lifecycle.test.ts`、`tools/back-layers.test.ts`、`tools/chat-browser-regression.mjs` 和 `tools/settings-navigation-browser.mjs`。后者使用真实 Hash History，覆盖账户详情返回、分类返回、首页退出确认与取消。

移动端历史边界在 Back 后通过 forward 恢复原记录，再执行关闭或父页替换；禁止在连续返回后用 pushState 重建边界。Chromium 在返回后会停止认可之前的用户激活，此时 pushState 可能使同文档记录全部被系统返回跳过。`history.back()` 不应用这套跳过规则，因此单独通过它的测试不足以证明 Android 手势返回正常。单元测试模拟该规则，浏览器回归额外断言连续返回不增加历史记录。参见 [Chromium history manipulation intervention](https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md)。

Android 真机回归还发现 `popstate` 的 Window 监听顺序不能靠 `capture: true` 修正：生产路由必须先创建 `backLayers`，再调用 `createWebHashHistory`。否则路由器先消费返回事件，后续控制器再恢复历史，会产生重复导航；模拟测试也必须保持注册顺序，不能自行把 capture 监听排到前面。

已连接 ADB 时可运行 `node tools/android-back-regression.mjs http://host:8790 TAB_ID`。先把指定 Wish 标签页置于前台并返回首页；脚本只打开配置，不修改或保存配置，通过 Android 屏幕左右边缘滑动验证详情、分类、首页、退出确认及取消后的交互。

### 文件修改卡片

Shell 结果中的文件修改从 `metadata.edits`（旧结果回退到工具输出）读取，不通过命令文本猜测。
同一段活动内每个文件一张正文卡片；1～3 个文件逐张展示，超过 3 个文件显示带数量的层叠卡片。
同一路径的多次修改保留各次 diff，合并到一张文件卡片。未变化的文件不生成卡片。
单张卡片打开该文件，层叠卡片打开整组文件；弹窗由会话级 `ActivityDialogs` 持有，虚拟行回收不关闭弹窗。
Shell 和 Session 操作仍保留时间轴记录，文件卡片不会替代工具执行历史。

验证：`tools/file-changes.test.ts`、`tools/file-changes-browser.mjs`。


## 依赖边界

`main.ts` 和路由负责组合功能。`core` 可以使用平台契约，但不得导入 UI 或 feature；平台适配器通过注册参数接收应用配置。`pnpm lint` 解析静态、动态导入和导出，拒绝反向分层依赖及 feature 之间的循环。

`domain/chat` 提供会话与群组共用的输入框、用户消息、分组投影和虚拟测量原语；`features/sessions` 装配会话页面、助手回复和执行活动。二者按复用范围划分，不按消息角色机械合并。提供商配置和登录位于 `features/providers`，诊断页面位于 `features/debug`。

`ui` 只保留通用控件和交互，不得导入 `domain`、`features` 或 `extensions`；`domain` 可依赖 `core`、`platform`、`ui` 和其他共享领域，不得导入路由功能或扩展实现。共享设置控件位于 `domain/settings`，扩展分类与工具列表由装配页面作为 Props 传入。检查器同时拒绝 feature 与领域模块的循环依赖。

`SessionPanelModal` 的触发按钮由会话页面通过注入显式提供，不查询 `.chatbar` 等业务 DOM。通用 UI 的手势观察信号通过 `ui/interactionSignals.ts` 提供，由启用后的诊断器订阅；控件不依赖诊断记录器或存储。DraftActions 仍是通过注入提供的通用表单操作。

指令投影返回稳定的语义类型，由展示层翻译标题；服务器保存的原始标题保持原样。设置快照和事件总线具有明确的类型契约，但这不表示所有上游字段都已经过运行时校验。

不按文件行数机械拆分：ChatLog 的滚动和虚拟化已经委托给多个 composable；页面保留装配职责。局部布局断点和算法常量不必集中到全局配置。通用状态组件、共享用量图表以及注入式表单操作也不构成反向依赖。


## 本轮源码审查核验与修正

- API 客户端的 AbortSignal 新方法依赖确实存在，现已用可销毁的组合取消域替代。连接测试和历史分页复用同一实现，正常完成、取消和超时都会释放资源。
- `sync` 原先缺少停止入口，现有停止、重启及迟到事件回归测试。当前切换服务器本来就会重载页面，不能据此推断现有切换必定泄漏。
- 活动记录器原本已默认关闭；滚动卡滞探针此前常驻，现也由「调试」中的记录开关统一控制，关闭即释放监听和计时器。全局未处理拒绝合并为非模态提示，主动操作仍展示对应错误。
- 菜单关闭后不再延留透明遮罩，只消费关闭手势产生的 click；下一次 pointerdown 开始的新手势立即可用。
- 连续 Back 与并发导航确实可能覆盖历史恢复 Promise，现保留首次恢复动作和等待者。现有 forward 边界有 Chromium 原生返回行为的验证依据，未用未经验证的全局重写替代。
- Markdown 原本已有 200 万 UTF-16 码元的缓存上限、代码高亮缓存和长文本节流。现在按顶层块复用净化后的 HTML 和 DOM，未闭合代码围栏暂缓高亮，避免缓存流式全文中间版本。仍解析整篇文档，以保证后置引用、列表、表格及公式语义；这不是完全增量的 AST 解析器。
- 输入框普通输入和 IME 提交保留原生节点；附件标记变化时才规范化 DOM。自定义撤销保留选区，`Selection.modify` 不存在或抛错时保守降级，不劫持中间行的上下键。
- 虚拟列表原先已有 rAF 合并和卸载清理，不能直接认定存在回流死循环；当前将自定义尺寸观察合并为一个 Observer 和每帧一次调度。
- 桌面与移动端复用同一个覆盖页实例，路由重开会取消关闭计时；仅凭两个 RouterView 不能证明重复挂载或白屏。浏览器回归已覆盖 899/900px 断点往返、草稿保留和快速关闭重开。220ms 是关闭动画的卸载兜底，仍需真机覆盖不同浏览器与手势。
- 配置、消息分组、历史行和文件 diff 的关键接口补上了类型；旧 diff 数据增加运行时筛选。其他上游兼容字段仍有 `any`，没有宣称已完成全仓严格类型迁移。

验证入口：`tools/source-review-browser.mjs`、`tools/overlay-layout-browser.mjs`、`tools/abort-scope.test.ts`、`tools/sync-lifecycle.test.ts`、`tools/back-layers.test.ts`、`tools/menu-backdrop.test.ts` 和 `tools/i18n-catalog.test.ts`，以及现有会话、输入历史、活动记录和设置导航浏览器回归。
