# 开发

[文档目录](README.md) · [English](../en/development.md)

## 环境要求

- Node.js 22.19 或更高版本，并启用 Corepack。测试会直接导入 TypeScript 文件，依赖 Node 内置的类型剥离功能。
- 一个可以连接的 Wish 服务端（见 [Wish 服务端说明](https://github.com/WindustH/wish-core#readme)）。只有单元测试不需要它。
- 仅重新生成字体时需要：装有 `fontTools` 和 `brotli` 的 Python 3，以及 `7z`。

## `./pnpmw`

`./pnpmw` 通过 Corepack 运行 `package.json` 中 `packageManager` 固定的 pnpm 版本。Corepack、pnpm 的存储和各类缓存都放在仓库内的 `.cache/` 目录里，不会向全局安装任何东西。所有 pnpm 命令都请通过它执行：

```sh
./pnpmw install --frozen-lockfile
./pnpmw add <包名>        # 版本号会精确记录（saveExact）
```

## 开发服务器

```sh
WISH_UPSTREAM=http://127.0.0.1:9780 ./pnpmw dev
```

Vite 会在 <http://127.0.0.1:5173> 启动支持热更新的开发服务器（这是 Vite 的默认端口，被占用时会顺延到下一个空闲端口）。它把 `/api` 转发到 `WISH_UPSTREAM`（默认 `http://127.0.0.1:9780`），设置了 `WISH_HTTP_TOKEN` 时还会加上 `Authorization: Bearer $WISH_HTTP_TOKEN`。

与生产环境的区别：开发模式下没有 Service Worker，所以安装和更新流程只能在构建产物上测试（`./pnpmw build && node serve.ts`）。主机名和来源检查属于 `serve.ts`，开发服务器上也没有。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `./pnpmw dev` | 开发服务器，见上文 |
| `./pnpmw build` | 先运行 `vue-tsc --noEmit`，再用 `vite build` 输出到 `dist/`。会话信息中显示的构建号是当前提交的前 12 位（不在 git 仓库中时为 `dev`） |
| `./pnpmw typecheck` | 只做类型检查（严格模式，并报告未使用的变量和参数） |
| `./pnpmw test` | 单元测试：`node --test tools/*.test.ts` |
| `./pnpmw selftest:api [url]` | 对运行中的服务做只读的 API 检查，默认 `http://127.0.0.1:8790` |
| `./pnpmw start` | `node serve.ts` |

## 测试

- **单元测试**（`./pnpmw test`，安装依赖后在仓库根目录运行）：`tools/*.test.ts`，基于 `node:test`。它们在不启动浏览器的情况下测试各类逻辑：API 数据转换和模型校验、聊天历史和消息队列、粘贴文本和附件占位符、配置合并、提供商就绪判断、列表和输入框的尺寸调整，以及已打补丁依赖的回归测试。
- **API 自检**（`./pnpmw selftest:api http://127.0.0.1:5173`，也可以是任何已部署的地址）：读取 `/version`、会话、提供商、默认设置、配置、用量、状态和存储，并确认 `/events` 以快照开头。它不会修改任何东西，失败时以非零状态退出。
- **浏览器自检**：打开 `/#/selftest?auto=1`，或在设置 →“界面”→“连接诊断”中点击“检查连接”。它会检查模块加载、语言和主题切换、本地存储、API、事件流和 Service Worker，不会改动服务端的任何数据。带 `?auto=1` 时，结果还会写入 `window.__selftestResult`。
- **服务端测试**在单独的 `wish-test` 仓库中。`tests/test_wish_server.py` 针对 `../wish-core`（或 `$WISH_CORE_REPO`）的调试构建进行黑盒 HTTP 测试，在 `wish-test` 目录下运行 `python3 -m unittest tests.test_wish_server -v`。`wish-test/web/` 下的浏览器测试是为早期的双守护进程服务端写的，还没有迁移到当前版本。

需要修改会话的检查，请在临时启动的服务端上进行，不要拿重要的会话做实验。

## 项目结构

```text
src/
  main.ts、App.vue、router.ts   启动流程、应用外壳与导航、路由
  core/                         各页面共用的逻辑
    api/                        HTTP 客户端、接口函数、SSE 读取、服务端数据转换
    state/                      状态模块：sessions、chat、stats、sync、prefs
    i18n/                       中英文词典、服务端错误的翻译
    usage/  util/  theme/       用量查询、缓存与工具函数、主题
    config.ts                   所有可调参数：尺寸、超时、限制、断点
  features/                     各个页面：sessions（列表、起始页、对话）、settings、
                                onboarding、stats、usage 图表、selftest
  ui/                           通用组件与组合式函数、Markdown、对话框、
                                提示消息、PWA 注册、快捷键、通知
  platform/                     存储、通知、文件、剪贴板和应用功能的适配层，
                                以及浏览器上的实现
  styles/  assets/fonts/        样式和内置字体
public/                         应用清单、图标、许可证文本
tools/                          测试、API 自检、字体构建脚本
patches/                        依赖补丁
serve.ts                       生产环境服务器
```

## 开发约定

- **只用 TypeScript。** 模块一律是 `.ts`，组件使用 `<script setup lang="ts">`，类型检查为严格模式。相对导入写出带扩展名的文件名（`./client.ts`、`./Modal.vue`），并且只使用可以直接擦除的语法（不用 `enum`、`namespace` 和构造函数参数属性），这样单元测试和 `serve.ts` 可以直接用 Node 运行，由 Node 去掉类型。
- **文案。** 所有可见文字都要有中英两个版本。多处共用的文字写成 `src/core/i18n/zh.ts` 和 `en.ts` 中的键（两个文件的键必须一致），通过 `i18n.t('key')` 使用；只在一处出现的文字可以直接写成 `tr('中文', 'English')`。
- **错误与反馈。** 出错时调用 `src/ui/errorDialog.ts` 中的 `showError({ title, error })`，它会弹出对话框，服务端的错误信息由 `src/core/i18n/errorMessages.ts` 翻译。操作成功时用简短的 `toast()` 提示。
- **较慢的读取。** 对于加载慢、稍旧一点也无妨的数据（统计、模型目录），使用 `src/core/util/responseCache.ts` 中的 `peekCached`、`readCached` 和 `writeCached`：先立即显示上次的结果，新数据到达后再替换。只能缓存普通的 JSON 数据。
- **布局。** 只有一个断点：900 像素（`cfg.breakpoints.desktop`），组件用 `useMedia('(max-width: 899px)')` 判断是否使用手机布局。改动后请分别在桌面端和手机端、浅色和深色主题下检查。
- **参数与平台。** 数值写在 `src/core/config.ts` 中，不要写死在组件里。存储、通知、文件、剪贴板和屏幕唤醒一律通过 `src/platform/` 的 `platform()` 访问，不要直接调用浏览器 API。

## 依赖补丁

有两个包打了补丁，登记在 `pnpm-workspace.yaml` 的 `patchedDependencies` 中：

| 补丁 | 修复的问题 | 对应测试 |
| --- | --- | --- |
| `patches/reka-ui@2.10.4.patch` | 滚动锁定不再修改页面的 `pointer-events`（交给可关闭层处理）；即使退出动画没有报告结束，关闭的对话框也会被卸载 | `tools/scroll-lock.test.ts`、`tools/presence-lifecycle.test.ts` |
| `patches/@tanstack__virtual-core@3.17.9.patch` | 在后台保持挂载的虚拟列表出现跳动和卡死：过期的滚动校正会被丢弃，而不是重放 | `tools/virtual-clamped-adjustment.test.ts` |

升级这两个包时，需要重新制作补丁（先运行 `./pnpmw patch <包名>`，再运行 `./pnpmw patch-commit <目录>`），并跑一遍测试。

## 字体

更纱黑体 SC（Sarasa Gothic SC，中文）和 Maple Mono NF CN（代码）按 Unicode 区段拆成许多小的 WOFF2 文件，浏览器只下载用得到的字形。更换字体后重新生成：

1. 把 `src/assets/fonts/<字体>/source.json` 中记录的压缩包下载到 `.cache/fonts/`。
2. 运行 `python3 tools/build-cjk-fonts.py sarasa`（或 `maple`）。

脚本会把 WOFF2 文件和 `source.json` 写入 `src/assets/fonts/<字体>/`，把 `@font-face` 规则写入 `src/styles/<字体>.css`。它借用已安装的 Noto Serif SC 包的 Unicode 区段划分，所以要先运行 `./pnpmw install`。许可证信息见 [THIRD_PARTY.md](../../THIRD_PARTY.md)。
