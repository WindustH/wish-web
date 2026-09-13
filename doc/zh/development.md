# 开发与验证

[文档目录](README.md) · [English](../en/development.md)

## 仓库工作流

使用仓库内 `./pnpmw` 和锁文件。Vue SFC 与 TypeScript 开启严格检查及未使用变量/参数检查。部分 Core 仍是 JavaScript，配有 `.d.ts` 接口；修改时保持二者一致。协调接口变化时不要引入第二份状态或旧后端兼容分支。

```sh
./pnpmw typecheck
./pnpmw build
```

构建生成 `dist/`、Vite 资源清单和 PWA 文件。`node_modules/`、`.cache/`、`dist/` 不纳入版本控制。第三方许可证和字体来源记录于 `THIRD_PARTY.md` 及字体资源清单。

## 测试

行为回归放在相邻的 `wish-test` 仓库，使用真实 Rust 二进制、临时配置与数据、本地假上游。付费提供商测试需要显式选择。

```sh
cd ../wish-test
python3 run_tests.py
python3 web/launch.py --check
bash web/run-scale.sh
```

运行单个浏览器场景时，先构建 Wish 和 Web，执行 `python3 web/launch.py 180`，再将输出的本地 Web URL 和结果目录传给 `node web/scenarios-missing-pages.mjs URL OUTPUT`。其他 `web/` 场景按各自说明使用同类入口。结束时创建输出中列出的 stop-file；启动器到期也会自动清理。测试成功和失败都必须清理自己的会话及进程。

按修改的职责选择回归：后端与代理隔离、配置并发冲突、流式重试和交接、旧会话回调、虚拟列表、响应式导航、焦点动画和图表范围。测试真实接口契约时，不能只用浏览器伪造数据代替后端。

## 增加功能

先明确后端归属，只封装 Web 实际需要的调用，在 Core 归一化数据，在业务或公共 UI 层渲染。优先使用已有 Reka UI 焦点弹窗、TanStack 虚拟列表和公共时间范围/图表工具。切换作用域时取消读取。保留按会话隔离的草稿，不因旧请求失败而跳走新会话。

同时更新中英文指南，并按源码检查链接和示例。后端完整公开 API 由 Wish 仓库维护；Web 文档说明归属和交互，避免重复维护整套接口结构。
