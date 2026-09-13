# 前后端接口契约

[文档目录](README.md) · [English](../en/api-contract.md)

## 归属与路由

| 浏览器前缀 | 后端 | 资源 |
| --- | --- | --- |
| `/wishd-api` | `wishd` | 会话、历史、投递、运行、附件、用量、运行时配置 |
| `/providerd-api` | `wish-providerd` | 提供商实例与预设、模型、协议、提供商配置 |

两个后端都提供 `/openapi.json`。实际处理函数和协议结构是行为依据。`src/core/api/endpoints.js` 只包含 Web 需要的接口子集，配置编辑的额外路由由 `config-editor.ts` 管理。删除未用的前端封装不意味着删除后端接口。

## 写入契约

公共 HTTP 客户端为写操作添加可打印的幂等键。会话模型和元数据编辑在有 revision 时发送 `If-Match`；可编辑配置在请求体中提交 revision 和有序操作。并发冲突向用户反馈，不静默覆盖。错误保留 HTTP 状态、code、detail 和 retryable；网络故障与 404/410 资源删除分开处理。

`POST /sessions/{id}/messages` 默认使用 `role: user` 和 `trigger_agent_loop: true`。返回投递回执不等于回答完成，需要跟踪投递、运行流和持久历史。会话删除会通过 `/sync/events` 发出 `session` 删除通知；只有当前显示的会话匹配时才跳转。

## 流式交接

`response_start` 开始新的模型请求缓冲，`response_retry` 清理失败尝试。文本、思考和工具增量只是临时显示状态。Assistant Message 持久保存后，`response_complete` 包含 `entry_id` 和 `finish_reason`。Web 在历史中核对该 ID 后移除流式回显。无状态请求没有会话 Entry ID；工具轮响应结束也不代表整个 run 完成。

历史和搜索使用规范序号、有界 keyset 分页和稳定 Entry ID。流式重连通过后端状态恢复，不凭空产生回答或重放工具操作。未知模型能力与明确的 `false` 不同。

## 用量契约

用量汇总、时序和热力图均提供全局及单会话接口。全局读取持久汇总投影，不扫描或解压全部会话库；删除会话后保留全局贡献。近期用量点保留原始请求时间戳，热力图按 `bucket_ms` 聚合并受后端范围和数量限制。这是请求级精度，不是单 Token 计时。

契约变更应同步修改客户端、处理函数、两种语言的参考文档和隔离接口/浏览器测试。流式结构变化需要前后端协调发布。
