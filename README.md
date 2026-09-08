# wish-web (webui v2)

本地自包含的 wishd Web 客户端。零构建、零运行时外网依赖,同时是未来桌面(Tauri)/移动(Capacitor)壳的基座。

## 运行

```bash
node serve.mjs            # http://127.0.0.1:8790  (API 反代 → 127.0.0.1:9780)
```

可选环境变量:`PORT`、`WISHD_UPSTREAM`、`WISHD_TOKEN`(守护 bearer 模式时注入)。
无 node?任何静态服务器 + 自己的同源反代也可,页面不挑宿主(hash 路由)。

## 布局(来自 wish-plan/webui/01.md)

- **桌面**(≥900px):左侧 vertical bar(上:会话/统计;下:设置)+ 会话页两栏(窄列表 + 对话)
- **移动**(<900px):无 vertical bar;bottom bar 所有图标不分组;会话列表独占,点入二级对话页(顶栏返回 + 单按钮弹菜单)
- 对话顶栏三入口:会话信息与统计 / 历史搜索 / 会话管理
- 桌面输入区是完整矩形，可拖动上边缘调整并记住高度；输入内容不会改变高度，超出时内部滚动。移动端从固定单行高度起，随内容增高，达到上限后内部滚动。
- 信息、搜索和管理面板从右侧滑出覆盖对话，保留对话 DOM、滚动位置、草稿和待发送图片。动效遵循系统减少动态效果设置。
- 接近历史顶部自动加载更早消息，以响应到达时的可见消息为锚点保持连续滚动。搜索直接读取目标附近历史，不受消息年龄限制；虚拟列表挂载目标后定位并高亮，工作过程中的目标步骤自动展开。之后可双向滚动补页，或直接返回最新消息。
- 思考/工具调用/工具结果默认折叠 chip,点击弹小窗看详情

## 架构

```
webroot/
  index.html            import map + 样式 + 挂载点
  manifest.webmanifest  PWA
  sw.js                 壳缓存(不缓存 /wishd-api)
  vendor/               preact / preact-hooks / htm(全部本地)
  app/
    core/               ← 零 DOM,壳/测试可直接复用
      config.js         所有尺寸/时长/阈值/分页/断点(唯一参数源)
      api/              client(fetch 封装+幂等键) endpoints(唯一 URL 面) sse(Last-Event-ID 重连)
      state/            reactive(自研 signal) sessions/chat/sync/stats/prefs 切片
      i18n/             zh/en 字典 + html lang 同步
      theme/            auto/light/dark,记忆选择
    platform/           平台适配层:storage/notify/fs/share/app;browser/ 为默认实现,壳注入替换
    ui/
      h.js              渲染绑定(换渲染器只改这里)
      router.js         hash 路由 + 移动断点
      components/       icon/button/modal/menu/toast/markdown/spinner/copyable
      layout/           appshell(vbar/bbar)
      features/         ★ 扩展点:新增界面 = 加一个 feature 目录并注册
        sessions/ list·chat·composer·entry(折叠块)·info·search·manage·newsession
        stats/ settings/ selftest/
  styles/               tokens(色彩)/base/components/layout/features,尺寸 token 由 config 写入
tools/
  fetch-icons.mjs       构建时抓 Lucide 子集 → ui/icons.js(81 枚,已入库)
  make-app-icons.py     PWA 图标
  selftest-api.mjs      无浏览器 API 自检
serve.mjs               静态 + /wishd-api 反代(SSE 透传不缓冲)
```

## 验证

```bash
node tools/check-imports.mjs
node tools/sw-manifest.mjs
cd ../wish-test
python3 run_tests.py
python3 web/launch.py --check   # 隔离真实后端，桌面与移动端验收
bash web/run-scale.sh           # 大列表与长会话验收
```

测试统一放在 `wish-test`，使用本地假模型和临时数据目录，成功或失败都会清理测试会话、浏览器和守护进程。应用内自检页仍可检查模块、图标、语言、主题、存储和 API。

## 响应流

设置页通过 `GET/PUT /config/streaming` 控制响应流，新启动的运行采用新值，已启动的运行保持原决定。没有响应流时，客户端根据持久资源轮询并更新对话。工具调用、结果和思考按原始顺序归入工作过程；不单独展示这些步骤的 Token 用量。正文用量采用“输入、输出、总计”。

会话组织字段存在 JSON `metadata` 中；编辑置顶、归档或标签会保留其他扩展键，并使用快照 revision 检测并发修改。

## 约束备忘

- 前后端遵循同一接口契约，不保留旧版本兼容分支。
- 所有第三方资源 vendor 于 `webroot/vendor/`,来源与版本见 THIRD_PARTY.md。
- 参数一律走 `core/config.js` + CSS custom properties,组件内无魔法数字。
