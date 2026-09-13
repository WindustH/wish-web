# 快速开始

[文档目录](README.md) · [English](../en/getting-started.md)

Wish Web 是 `wishd` 和 `wish-providerd` 的浏览器客户端。使用会话和提供商功能前，需要启动两个后端。浏览器分别通过同源代理访问它们；会话记录不由 Wish Web 自己保存。

## 构建和运行

需要 Node.js 22.19.0 或更高版本以及 Corepack。在本仓库运行：

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
node serve.mjs
```

打开 `http://127.0.0.1:8790`。默认连接 9780 端口的 `wishd` 和 9781 端口的 `wish-providerd`。`./pnpmw` 将依赖和包管理器缓存保存在当前仓库。部署只需要 `dist/` 和 `serve.mjs`，不需要 `node_modules`。

开发时运行 `./pnpmw dev`。Vite 将 `/wishd-api` 和 `/providerd-api` 转发到本机默认端口。开发代理不读取生产服务器的令牌和环境变量设置；需要其他开发后端时修改 `vite.config.ts`。

## 第一次对话

进入设置中的提供商页面，添加预设或自定义提供商，填写凭据后保存。在新对话工具栏中选择模型并发送消息。新建会话采用的模型会记为后端的新会话默认模型；在已有会话中切换模型只影响当前会话。

桌面端同时展示会话列表和对话。移动端主页面包含输入区和最近会话，“查看全部会话”进入完整列表；统计和设置从主页面菜单进入。界面语言、主题等偏好保存在当前浏览器。

后端不可用时显示请求错误；会话不存在或页面地址无效时自动返回会话入口。连接或模型故障见[故障排查](troubleshooting.md)。
