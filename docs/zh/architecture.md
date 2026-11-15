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

会话文件夹在平台注册后显式水合，模块导入不提前读取存储。响应缓存通过可选平台适配器持久化；
浏览器写入、清理等到 IndexedDB 事务提交后返回，连接切换先停止迟到写入、完成清理，再导航。
字号的 DOM 同步由启动入口订阅，偏好状态不直接修改样式。
- **路由**使用 URL 的 hash（`/#/s/<id>`），因此任何静态托管都能用，无需配置重写规则。桌面端的会话信息、历史搜索和会话设置是浮在对话上方的对话框；手机上则是子路由（`/#/s/<id>/info`、`/search`、`/settings`）。

## 实时更新

### 右侧栏与会话库

各面板首次打开后保持挂载，包括库与后台任务；隐藏时停用轮询。扣除左栏后的工作区不足 800px 时，
右栏以抽屉覆盖；停靠时至少为正文保留 480px。仅当前面板持有 `session-sidebar` 无障碍 ID。
快捷键提示与无障碍键位跟随用户配置。搜索命令提交聚焦意图，由已就绪的输入框消费，不查询其他组件的 CSS。

`ChatPane` 的标题栏横跨对话与右侧栏，最右侧按钮独立切换侧栏；「库」按钮打开 Library。
对话输入区与消息列表保持挂载，侧栏开关不重建草稿或流式输出。`ui/components/IslandSidebar`
只提供容器、标题与操作插槽，不依赖文件业务，后续内容可复用。

会话页面中，Tab 开关右侧栏，Shift+Tab 开关桌面会话列表，复用按钮动作与已保存的面板状态。
消息输入区中，Tab 在光标或选区处插入制表符，保留输入焦点并支持撤销；Shift+Tab 向前切换焦点。
其他输入控件、菜单和弹窗保留正常的焦点切换；长按按键不会反复开关侧栏。

拥挤桌面下的时间轴展开箭头保持与展开时间轴相同的横向位置，只跟随鼠标纵向移动，随横向距离淡入淡出。
悬停只改变箭头颜色，不添加背景；键盘聚焦时保持可见，展开后的活动节点优先接收点击。

`features/sessions/SessionLibrary` 使用 `GET …/blobs` 分页读取当前会话目录，文件是否出现在库中
不依赖已加载的历史页。历史中的附件名称只补充展示名称。列表含图片缩略图、类型筛选与手动刷新；
未分页且列表可见时每 15 秒更新一次。关闭或切换会话取消请求与计时器，列表按会话隔离。
多选按钮、文件菜单或 Shift＋左键进入多选；普通点击切换勾选，Shift＋点击选择当前分类中已加载的
连续区间，Esc／移动端 Back 先清空选择，再关闭侧栏。底部工具栏支持批量引用、置顶／取消置顶、
显示／隐藏和删除；删除确认固定的目标列表，部分失败时保留失败项供重试。尚有分页时，全选按钮
明确标注「全选已加载」。批量写入逐个执行，切换会话或卸载时取消；批量引用按顺序插入输入框。
选择只属于当前库视图，多选期间暂停定时刷新。

图片、音视频和 PDF 复用短期单文件播放授权，避免给媒体元素暴露账户访问令牌；音视频保留原生
控件和 Range 请求。文本最多读取前 256 KiB 并以纯文本显示。PDF.js 与 Worker 按需加载，
`domain/media/PdfPreview` 仅渲染当前页并限制画布像素，提供翻页与缩放，关闭时取消渲染和加载。
PDF.js 的字体、字符映射和 WASM 从依赖生成到构建产物，不把二进制文件提交至源码仓库。
媒体封面、图片预览和提取的 PDF 单页共享按服务器隔离的内存缓存（64 项／32 MiB／10 分钟）。
组件重新挂载时先显示缓存；列表刷新时保留当前封面，以文件版本或图片 ETag 在后台校验本地链接。
文件未变不重新生成封面。原始媒体和临时播放 URL 不存入此缓存，刷新整个页面会释放缓存。

桌面栏与对话并排，以单条分割线分隔，不设外边距、圆角或阴影；手机上铺满内容区。系统返回先退出文件预览，再关闭侧栏，随后才返回会话列表。

活动时间线在对话区域留白充足时浮于正文旁，手机或空间拥挤的桌面区域则使用同一套滑动抽屉。
判断依据是对话区域的实际布局宽度，而非窗口宽度；展开只平移内容，不使消息重新换行。
桌面端提供展开按钮，保留鼠标划词操作。
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

验证入口：`../wish-test/web/frontend/dialog-lifecycle.test.ts`、`../wish-test/web/frontend/back-layers.test.ts`、`../wish-test/web/frontend/chat-browser-regression.mjs` 和 `../wish-test/web/frontend/settings-navigation-browser.mjs`。后者使用真实 Hash History，覆盖账户详情返回、分类返回、首页退出确认与取消。

移动端历史边界在 Back 后通过 forward 恢复原记录，再执行关闭或父页替换；禁止在连续返回后用 pushState 重建边界。Chromium 在返回后会停止认可之前的用户激活，此时 pushState 可能使同文档记录全部被系统返回跳过。`history.back()` 不应用这套跳过规则，因此单独通过它的测试不足以证明 Android 手势返回正常。单元测试模拟该规则，浏览器回归额外断言连续返回不增加历史记录。参见 [Chromium history manipulation intervention](https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md)。

Android 真机回归还发现 `popstate` 的 Window 监听顺序不能靠 `capture: true` 修正：生产路由必须先创建 `backLayers`，再调用 `createWebHashHistory`。否则路由器先消费返回事件，后续控制器再恢复历史，会产生重复导航；模拟测试也必须保持注册顺序，不能自行把 capture 监听排到前面。

已连接 ADB 时可运行 `node tools/android-back-regression.mjs http://host:8790 TAB_ID`。先把指定 Wish 标签页置于前台并返回首页；脚本只打开配置，不修改或保存配置，通过 Android 屏幕左右边缘滑动验证详情、分类、首页、退出确认及取消后的交互。

### 文件修改卡片

Shell 结果中的文件修改从 `metadata.edits`（旧结果回退到工具输出）读取，不通过命令文本猜测。
同一段活动内每个文件一张正文卡片；1～3 个文件逐张展示，超过 3 个文件显示带数量的层叠卡片。
同一路径的多次修改保留各次 diff，合并到一张文件卡片。未变化的文件不生成卡片。
单张卡片打开该文件，层叠卡片打开整组文件；弹窗由会话级 `ActivityDialogs` 持有，虚拟行回收不关闭弹窗。
Shell 和 Session 操作仍保留时间轴记录，文件卡片不会替代工具执行历史。

同组文件 mention 卡片在三个以内逐张显示，超过三个收成带数量的层叠卡片。
完整列表由会话级 `ActivityDialogs` 持有，虚拟行回收不关闭弹窗；选择文件保留页码或时间定位，
成功打开侧栏后关闭列表。

验证：`../wish-test/web/frontend/file-changes.test.ts`、`../wish-test/web/frontend/file-changes-browser.mjs`。


## 依赖边界

`main.ts` 和路由负责组合功能。`core` 可以使用平台契约，但不得导入 UI 或 feature；平台适配器通过注册参数接收应用配置。`pnpm lint` 解析静态、动态导入和导出，拒绝反向分层依赖及 feature 之间的循环。

`domain/chat` 提供会话使用的输入框、用户消息、分组投影和虚拟测量原语；`features/sessions` 装配会话页面、助手回复和执行活动。二者按复用范围划分，不按消息角色机械合并。提供商配置和登录位于 `features/providers`，诊断页面位于 `features/debug`。

`ui` 只保留通用控件和交互，不得导入 `domain`、`features` 或 `extensions`；`domain` 可依赖 `core`、`platform`、`ui` 和其他共享领域，不得导入路由功能或扩展实现。共享设置控件位于 `domain/settings`，扩展分类与工具列表由装配页面作为 Props 传入。检查器同时拒绝 feature 与领域模块的循环依赖。

`SessionPanelModal` 的触发按钮由会话页面通过注入显式提供，不查询 `.chatbar` 等业务 DOM。通用 UI 的手势观察信号通过 `ui/interactionSignals.ts` 提供，由启用后的诊断器订阅；控件不依赖诊断记录器或存储。DraftActions 仍是通过注入提供的通用表单操作。

指令投影返回稳定的语义类型，由展示层翻译标题；服务器保存的原始标题保持原样。设置快照和事件总线具有明确的类型契约，但这不表示所有上游字段都已经过运行时校验。

不按文件行数机械拆分：ChatLog 的滚动和虚拟化已经委托给多个 composable；页面保留装配职责。局部布局断点和算法常量不必集中到全局配置。通用状态组件、共享用量图表以及注入式表单操作也不构成反向依赖。


## 请求与渲染生命周期

- API 客户端使用可销毁的组合取消域。连接测试和历史分页复用同一实现，正常完成、取消和超时都会释放资源。
- `sync` 支持停止和重启，并丢弃迟到回调。切换服务器会重载页面。
- 活动记录器和滚动卡滞探针由「调试」中的记录开关统一控制，关闭即释放监听和计时器。全局未处理拒绝合并为非模态提示，主动操作仍展示对应错误。
- 菜单关闭时立即移除遮罩，只消费关闭手势产生的 click；下一次 pointerdown 开始的新手势立即可用。
- 连续 Back 与并发导航保留首次历史恢复动作和等待者。
- Markdown 的全文缓存上限为 200 万 UTF-16 码元，另有代码高亮缓存和长文本节流。按顶层块复用净化后的 HTML 和 DOM，未闭合代码围栏暂缓高亮，避免缓存流式全文中间版本。仍解析整篇文档，以保证后置引用、列表、表格及公式语义。
  表格等行内内容中的 `<br>`、`<br/>` 和 `<br />` 通过解析规则转换为换行；原始 HTML 仍关闭，代码和转义标签按文字展示，复制／引用的源码保留原始标签。
- 输入框普通输入和 IME 提交保留原生节点；附件标记变化时才规范化 DOM。自定义撤销保留选区，`Selection.modify` 不存在或抛错时保守降级，不劫持中间行的上下键。
- 虚拟列表将自定义尺寸观察合并为一个 Observer 和每帧一次调度，卸载时释放资源。
- 桌面与移动端复用同一个覆盖页实例，路由重开会取消关闭计时；关闭动画有 220ms 的卸载兜底。
- 配置、消息分组、历史行和文件 diff 使用类型化接口；旧 diff 数据另做运行时筛选，部分上游兼容字段仍有 `any`。

### 文件库与源码预览

库顶栏保留分类与数量，多选、全部文件、链接、上传、刷新和视图选择收进统一菜单。图标、紧凑、详细
三种视图共用虚拟窗口并保存偏好。文件夹由服务端按会话持久化，创建、重命名和批量移动只修改组织元数据，
不会搬动 blob 内容或链接的原文件。鼠标可将选中文件拖入文件夹或面包屑上级；移动端普通模式长按拖动，
多选模式复用会话列表的长按连续选择及边缘自动滚动。文件夹弹窗不属于虚拟行。
上传复用会话 blob 接口；右键或文件操作菜单的「引用到对话」
追加已存储附件到现有草稿，不自动发送。移动端将库放进顶栏菜单，将模型、思考等级与图片、附件、BTW
集中到输入框的操作菜单，模型和思考等级只显示当前选项，沿用标题栏字重和大写样式。
移动端会话输入框为空且未聚焦时收成一行；聚焦或保留草稿时展开，复用同一个编辑节点以保留光标与输入法状态。

媒体缩略图进入视口附近才加载：视频显示静止画面与播放图标；音频通过按需加载的 music-metadata
及 Range 请求读取内嵌封面（最多 4 MiB、32 次请求、10 秒），缺失或失败时使用音乐图标。
PDF 使用角落图标，图片不再叠加类型文字。

文本与源码通过 `domain/media/SourcePreview` 显示行号与共享语法高亮，行号不进入复制内容。
片段引用保存原始 UTF-16 位置、文件名、行范围与版本，定位前核对原文。Markdown 默认展示源码；
Markdown、HTML、SVG 可显式切换预览。HTML 在清理后的沙箱 iframe 中展示，禁用脚本与外部请求；
SVG 复用图片缩放与框选引用。文本读取仍限制为前 256 KiB。

### 引用与媒体交互

移动端选区通过 `ui/selectionActions` 取得所属 `Menu` 的复制与回复操作，复用原文位置映射，
不再打开第二个菜单。高亮和手柄放在消息自身的定位容器内，随文字同步滚动；只有操作栏跟随视口。
`touch-reply-browser.mjs` 覆盖实际触摸、拖动后引用、发送元数据与同步滚动，
`touch-selection-layout-browser.mjs` 覆盖布局变化与清理。

`ui/viewport` 为应用和弹窗提供可见视口高度与偏移。外层文档固定，消息和表单各自滚动；
键盘收起时清理残留的文档滚动，并处理 WebKit 延迟更新，不重置消息位置或强制取消输入焦点。
`keyboard-viewport-browser.mjs` 模拟键盘视口变化；这项回归检查不能替代 iOS 真机验证。

文件链接由 `domain/references/ReferenceMarkdown` 处理；通用 `ui/Markdown` 发出链接点击事件并负责代码复制。
侧栏定位通过待处理目标传递，挂载后消费，不再依赖固定时长轮询；关闭、重开和新目标会使旧请求失效。

引用回链通常只刷新新输入实际引用的来源。若运行期间用户正在浏览旧历史、无法得知新输入来源，则保守地全量刷新。
没有回链的文本不读取悬停几何信息，有回链时每动画帧最多测量一次。PDF 只有存在手势或选区的页注册全局选区监听；
拖动侧栏宽度时延后光栅化。触点不足两个时释放缩放状态，仍抑制手势合成点击。

会话间消息沿用接收方的会话历史，卡片可跳转到发送方；不再提供群组路由、群组入口或独立通信历史。

### 状态与交互约束

- 库打开后才查询，首次直接请求当前文件夹；旧服务端拒绝文件夹参数时退回兼容请求。
  已删除的保存目录回到根目录。关闭侧栏、换会话或换目录会取消批处理、移动、上传与链接；
  取消后续请求不代表能撤销已经完成的操作。
- Tab／Shift+Tab 开关侧栏，按钮获得焦点后仍可触发；临时弹窗保留焦点遍历，输入框保留缩进。
  触屏选区拖动先校验锚点仍在原文中，避免流式替换节点引发 Range 异常。
  弹窗的指针捕获仅用于鼠标拖选文本字段。
- HTML 预览在 head 带属性时也插入 CSP，仍保留 sandbox；换文件或会话重置预览模式。
  文件图标与 CSS 变量改用现有目录中的定义；SSE 兼容非 JSON 的 409，独立服务器正确处理异常路径和 HEAD。
- 历史投影保留事件语义，图片与压缩事件的标题在显示时翻译，切换语言无需重新获取历史。
  旧群组事件键和指令标题保留兼容读取，不再作为当前群组功能入口。
- 设置表单能响应外部重置且不吞掉未填完的行；MCP 参数输入后立即同步草稿。
  分步保存会话设置时逐步更新已保存基线，后续失败保留待保存改动；次要配置保存入口支持冲突重放，
  避免覆盖新续期的凭据；引导页验证请求独立管理取消。

选区和菜单打开期间观察滚动容器，并按帧合并回调。固定高度的滚动容器中，前方内容变高也会改变
选区位置，因此观察范围包含这些布局变化，不能仅限选中的原文节点。

快捷键默认值位于 `core/shortcuts.ts`，由 `core/state/shortcutsSlice.ts` 保存，`features/shell/shortcuts.ts` 分发。设置 → 快捷键集中配置应用按键、发送方式和浏览器查找／光标浏览／打印／保存／开发者工具快捷键；浏览器操作的开关开启表示允许，关闭表示禁用。浏览器拦截先于输入法组合状态检查，应用快捷键仍在组词时暂停。偏好遵循设置的保存／放弃行为，仅保存在当前浏览器。
