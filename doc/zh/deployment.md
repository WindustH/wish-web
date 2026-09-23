# 部署

[文档目录](README.md)

使用相邻 wish-core 构建单一后端：

```sh
cargo build --release --manifest-path ../wish-core/Cargo.toml
../wish-core/target/release/wish --config /absolute/path/config.json
./pnpmw install --frozen-lockfile
./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.mjs
```

生产部署仅需要 dist/ 和 serve.mjs，无需 node_modules。使用 Node 22.19+。默认 WebUI 地址为 http://127.0.0.1:8790。后端启用认证时，在 WebUI 服务环境设置 WISH_HTTP_TOKEN，代理会注入请求头，浏览器不持有密钥。

局域网访问需配置 LISTEN_HOST=0.0.0.0 和 ALLOWED_HOSTS，后者填写访问时使用的完整主机名或 IP 加端口，多个值用逗号分隔。后端可继续监听回环地址。服务面向单个受信任用户，shell 具有服务进程的操作系统权限。

切换前停止旧 wishd/providerd，使用空数据目录；不提供旧格式迁移。SIGTERM 会等待执行器保存有效部分输出、完成工具清理并刷新存储。
