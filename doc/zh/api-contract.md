# API 契约

[文档目录](README.md)

浏览器统一访问 `/api`。`endpoints.js` 使用新后端请求结构，`projections.js` 将协议消息转换为界面展示数据。

会话列表返回 `{items:[{session,status}],next}`，支持名称、状态、标签筛选。PATCH 支持名称、提供方、配置及任意 JSON 元数据；DELETE 删除会话。复制会话使用当前上下文；清空上下文仅保留固定提示词，完整历史仍可检索。

`input` 持久化输入并安排执行；`messages` 仅入队，`run` 显式恢复执行。会话 SSE 提供临时增量，分页 `/history` 提供已持久化消息。全局 `/events` 通知列表更新。重连会重新读取状态，不重复提交消息或工具调用。

配置保存携带 revision，会话修改可携带 If-Match。没有旧版幂等键 API。历史查询支持消息类型、时间和元数据过滤；搜索返回有限结果及 has_more，“更多”扩大结果数量。历史浏览通过序号分页，不加载完整历史。

完整路由见 [后端 API](../../../wish-core/docs/server/api.md)。
