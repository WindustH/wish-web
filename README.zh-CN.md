<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wish-logo-dark.svg">
    <img src="docs/assets/wish-logo-light.svg" alt="Wish" width="300">
  </picture>
</p>

<p align="center">
  <a href="docs/user/README.md">用户文档</a> ·
  <a href="docs/developer/README.md">开发者文档</a> ·
  <a href="https://github.com/WindustH/wish-core">Wish 服务端</a> ·
  <a href="README.md">English</a>
</p>

---

Wish 是一个简洁、可靠、功能完备的 AI Agent Harness。这里存放的是它的前端界面——为桌面端和移动端分别做过深度适配与打磨，无论是在电脑前还是手机上，都能轻松访问你的 Wish。希望你的愿望能通过 Wish 实现！

## 下载与使用

日常使用无需单独部署前端——`wish-agent` 安装包以及 [Wish Core Releases](https://github.com/WindustH/wish-core/releases) 都已内置编译好的界面，安装并运行 `wish` 即可在 `http://127.0.0.1:8790` 打开：

```sh
npm install -g wish-agent               # 或 yay -S wish-agent-bin / brew install windusth/tap/wish-agent
wish
```

如果需要单独拉取并构建托管前端（需要 Node.js 22.19+）：

```sh
git clone https://github.com/WindustH/wish-web.git
cd wish-web
./pnpmw install --frozen-lockfile && ./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
```

移动设备自托管前端时，可用 `WISH_SSH_CLIENT=1 node serve.ts` 启动，在本机浏览器中生成登录密钥或使用系统 SSH 身份。公网只需开放后端的 SSH 监听端口。[SSH 连接配置](docs/user/deployment.md#device-local-ssh-client)

## 文档

- **用户文档**（英文）：[使用指南](docs/user/user-guide.md) · [设置与配置](docs/user/configuration.md) · [部署指南](docs/user/deployment.md) · [故障排查](docs/user/troubleshooting.md)
- **开发者文档**（英文）：[开发指南](docs/developer/README.md) · [架构说明](docs/developer/architecture.md) · [交互与界面实现](docs/developer/interactions-and-ui.md)

## 许可协议

[MIT](LICENSE) · [第三方组件许可](THIRD_PARTY.md)

### Tauri 2 客户端

Wish 可以打包为桌面或手机应用。应用内置网页资源和 Rust 网络客户端，启动后可直接填写服务器地址，也可以生成 SSH 密钥、核对主机指纹并登录。手机无需运行 Node.js。构建步骤见[原生客户端](docs/user/native.md)。
