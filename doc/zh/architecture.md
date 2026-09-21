# 架构

[文档目录](README.md)

```text
Vue 页面 -> 状态模块 -> API / 展示转换
                          |
                       /api 代理
                          |
                       wish HTTP
                      /         \
                  Session      provider
                     |
                  executor -> model / tool
                     |
                 SQLite / 历史索引
```

会话事件驱动临时文本、思考和工具预览，持久化历史接替已接受的预览。会话索引支持列表筛选，无需读取消息正文。用量按逻辑模型调用统计，不宣称统计了底层重试次数或实际流式 TPS。导航和重连后根据后端状态协调界面，历史数据始终以后端为准。
