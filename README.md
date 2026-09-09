# Wish Web

基于 Vue 3 的 Wish 客户端，分别连接 wishd 和 wish-providerd。桌面与移动端共用业务逻辑，布局和输入交互按设备适配。

## 开发和构建

需要 Node.js 22.19 或更高版本与 Corepack。使用仓库内的入口运行 pnpm：

```sh
./pnpmw install --frozen-lockfile
./pnpmw typecheck
./pnpmw build
node serve.mjs
```

浏览器打开 `http://127.0.0.1:8790`。开发时可运行 `./pnpmw dev`，由 Vite 提供模块热更新。

`package.json` 固定包管理器与直接依赖版本，`pnpm-lock.yaml` 固定完整依赖图。依赖和工具缓存均留在这个开发目录：

| 内容 | 位置 |
| --- | --- |
| 项目依赖 | `node_modules/` |
| pnpm 包存储和下载缓存 | `.cache/pnpm/` |
| Corepack 下载的包管理器 | `.cache/corepack/` |
| 构建缓存 | `.cache/vite/` |
| 可部署静态文件 | `dist/` |

请使用 `./pnpmw`，它会为本次命令设置项目内的缓存路径。安装不需要全局安装应用依赖。`node_modules`、`.cache`、`dist` 不纳入 Git。

## 部署和后端连接

先构建，再把 `dist/` 和 `serve.mjs` 放到发布目录；发布目录不需要 `node_modules`。也可以用其他静态服务器托管 `dist/`，并配置下面两个同源反向代理。

| 浏览器入口 | 默认上游 | 上游地址变量 | 可选服务令牌 |
| --- | --- | --- | --- |
| `/wishd-api` | `http://127.0.0.1:9780` | `WISHD_UPSTREAM` | `WISHD_TOKEN` |
| `/providerd-api` | `http://127.0.0.1:9781` | `PROVIDERD_UPSTREAM` | `PROVIDERD_TOKEN` |

wishd 不代转 providerd 的公开 API。两个地址均支持带路径前缀的 HTTP/HTTPS URL。反向代理只向对应上游注入其令牌，SSE 流直接转发；浏览器断开会释放上游连接。上游认证或监听地址改变后，也需要相应调整客户端连接设置。

默认仅本机可访问。局域网调试可显式开放监听与访问地址：

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.31.161:8790 node serve.mjs
```

`PORT` 默认为 `8790`；`ALLOWED_HOSTS` 支持逗号分隔的多个 `主机:端口`。健康检查为 `/healthz`。页面与 JavaScript 均来自本地构建，不依赖运行时 CDN。PWA 只缓存静态页面资源，不缓存两个 API；有更新时由用户决定何时应用。

## 代码结构

```text
src/
  main.ts             Vue 启动、平台注册、全局订阅
  router.ts           Vue Router，hash 路由与页面懒加载
  core/               无 DOM 的 API、SSE、会话与历史业务逻辑
    config.js         尺寸、时间、分页与连接参数
    config-editor.ts  独立后端配置草稿、有序字段补丁与保存状态
    state/            Vue 原生浅引用与计算状态
  platform/           存储、文件、通知与应用宿主能力
  features/           会话、设置、统计与连接诊断页面
  ui/                 共享 Vue 组件与浏览器交互
  styles/             主题与布局
public/               PWA 图标与应用描述
vite.config.ts        构建、开发代理与 PWA 静态缓存
serve.mjs             静态服务器与两个独立的 API 代理
```

通用交互采用 Reka UI，长列表采用 TanStack Virtual，图标采用 Lucide Vue 按需导入。Markdown 使用 markdown-it 与 DOMPurify。第三方版本和许可证见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 会话和设置

桌面输入区为完整矩形，拖动上边缘或用键盘调整高度；输入内容不会使它自动增高。移动端从固定单行高度开始，随内容增长，到上限后内部滚动。

信息、历史搜索和管理面板从右侧滑出覆盖对话，打开与关闭保留阅读位置、草稿和待发图片。到达历史顶部会自动加载更早的消息；搜索通过目标附近的有限分页定位旧消息。工作过程统一折叠，不为每个思考或工具调用显示 Token 用量。

会话元数据使用 JSON 对象。编辑标签时保留其他扩展字段，并用 revision 防止并发覆盖。列表不提供归档、置顶或冷存标签。标题旁可修改会话模型，新选择从下一次运行开始采用。清理旧数据支持 7/30/90 天和自定义天数，先预览，再按同一个截止时间执行。

设置分为界面、wishd 和 wish-providerd 三个 Tab。后端配置使用开关、下拉框、数字和密钥输入控件，支持提供方、端点与模型配置的增删。保存时仅提交实际修改的字段；未修改的密钥和环境变量引用保留。并发冲突、验证失败和重新读取均明确反馈，放弃未保存的修改需要确认。配置草稿仅在页面内存中保留，密钥不写入浏览器本地存储。

## 验证

所有回归测试放在相邻的 `wish-test` 仓库。先构建前端，然后执行：

```sh
cd ../wish-test
python3 run_tests.py
python3 web/launch.py --check
bash web/run-scale.sh
```

Rust 使用真实二进制的外部 API/CLI 测试，不在生产代码内嵌测试。浏览器测试使用隔离双后端和本地假模型；每次测试负责清理自己的会话、浏览器、进程与临时数据，包括失败路径。
