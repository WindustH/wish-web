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
- 输入区:移动单行起(图左/发右),桌面大区域起(图左上/发右下);增高有上限,超出滚动
- 思考/工具调用/工具结果默认折叠 chip,点击弹小窗看详情

## 架构

```
webroot/
  index.html            import map + 样式 + 挂载点
  manifest.webmanifest  PWA
  sw.js                 壳缓存(不缓存 /wishd-api)
  vendor/               preact / preact-hooks / htm / morphicons(全部本地)
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
  e2e.ts                CDP 真实 E2E(deno)
  selftest-api.mjs      无浏览器 API 自检
serve.mjs               静态 + /wishd-api 反代(SSE 透传不缓冲)
```

## 验证

```bash
node serve.mjs &                       # 起服务
node tools/selftest-api.mjs            # API 面 3 项
# 浏览器打开 http://127.0.0.1:8790/#/selftest 或:
deno run --allow-net --allow-run --allow-read --allow-write tools/e2e.ts          # 桌面 E2E
deno run --allow-net --allow-run --allow-read --allow-write tools/e2e.ts --mobile # 移动 E2E
```

自检页覆盖:模块加载 / 图标 / i18n 切换 / 主题切换 / 平台存储 / API / SSE / vendor 完整性 / SW。
E2E 覆盖:建 webui-v2 前缀会话 → 发消息 → SSE 回复 → 折叠详情 → 搜索 → 新建 → 主题/语言切换 → (移动)bottom bar 全流程 → 断言零控制台错误、零外网请求。

## 流式说明(重要)

守护 `config.toml [streaming] enabled = false` 时,SSE 只有 `resource`+`response_complete`,无逐字增量。
客户端双模式兼容:有增量实时渲染;无增量显示思考态并在完成事件后从持久历史对账。开启守护 streaming 后前端零改动即获得逐字体验(详见 wish-plan/from-llm/13)。

## 约束备忘

- 不改 wish 后端仓库;缺的接口一律记录在 `~/Downloads/wish-plan/from-llm/`(00-index.md 有索引)。
- 所有第三方资源 vendor 于 `webroot/vendor/`,来源与版本见 THIRD_PARTY.md。
- 参数一律走 `core/config.js` + CSS custom properties,组件内无魔法数字。
