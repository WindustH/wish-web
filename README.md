<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wish-logo-dark.svg">
    <img src="docs/assets/wish-logo-light.svg" alt="Wish" width="300">
  </picture>
</p>

<p align="center">
  <a href="docs/user/README.md">User Docs</a> ·
  <a href="docs/developer/README.md">Developer Docs</a> ·
  <a href="https://github.com/WindustH/wish-core">Wish Server</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

---

Wish is a clean, capable, and reliable AI agent harness. This repository holds its web interface, crafted specifically for both mobile and desktop so you can access your sessions comfortably from any device. Here's to turning your wishes into reality.

## Download & run

The built web UI already comes bundled inside `wish-agent` packages and [Wish Core Releases](https://github.com/WindustH/wish-core/releases). Installing `wish-agent` and running `wish` brings up both the server and the UI at `http://127.0.0.1:8790`:

```sh
npm install -g wish-agent               # or yay -S wish-agent-bin / brew install windusth/tap/wish-agent
wish
```

If you want to build and host `wish-web` on its own against a running Wish server (requires Node.js 22.19+):

```sh
git clone https://github.com/WindustH/wish-web.git
cd wish-web
./pnpmw install --frozen-lockfile && ./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
```

## Documentation

- **User guides**: [User Guide](docs/user/user-guide.md) · [Configuration](docs/user/configuration.md) · [Deployment](docs/user/deployment.md) · [Troubleshooting](docs/user/troubleshooting.md)
- **Developer notes**: [Development Guide](docs/developer/README.md) · [Architecture](docs/developer/architecture.md) · [Interactions & UI](docs/developer/interactions-and-ui.md)

## License

[MIT](LICENSE) · [Third-party licenses](THIRD_PARTY.md)

The [Tauri 2 native client](docs/user/native.md) packages this UI with a device-local SSH and HTTP(S) transport for desktop and mobile.
