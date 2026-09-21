# Wish Web

Vue 3 client for Wish sessions, provider configuration and usage statistics. Desktop and mobile share the same backend contract with responsive navigation and layout.

Wish 的 Vue 3 客户端，提供会话、提供商配置与用量统计。桌面和移动端共用业务逻辑，并分别适配布局和导航。

## Documentation / 文档

- [English documentation](doc/en/README.md)
- [完整中文文档](doc/zh/README.md)
- [Third-party licenses / 第三方许可](THIRD_PARTY.md)

## Quick start / 快速开始

Requires Node.js 22.19.0+ and Corepack. Start the new single `wish` backend (9780), then:

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.mjs
```

Open / 打开 `http://127.0.0.1:8790`.

Production serving needs `dist/` and `serve.mjs`, without `node_modules`. See the [deployment guide](doc/en/deployment.md) / [部署指南](doc/zh/deployment.md) for proxy, authentication and LAN settings. Regression tests live in the sibling `wish-test` repository.
