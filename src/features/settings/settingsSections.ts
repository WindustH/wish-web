import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
export const sections = computed(() => [
  {
    id: 'service',
    icon: 'service',
    label: tr('会话', 'Sessions'),
    summary: tr('默认模型、提示词与上下文', 'Model, instructions and context'),
    description: tr(
      '新会话的默认模型、工作目录、提示词和上下文压缩。',
      'Defaults for new sessions: model, working directory, instructions and context compaction.',
    ),
  },
  {
    id: 'accounts',
    icon: 'key',
    label: tr('账户', 'Accounts'),
    summary: tr('凭据与订阅登录', 'Credentials and sign-in'),
    description: tr(
      '模型、搜索与网页读取服务共同使用的账户。',
      'Accounts shared by model, search and web fetch services.',
    ),
  },
  {
    id: 'providers',
    icon: 'bot',
    label: tr('模型', 'Models'),
    summary: tr('连接、认证与模型管理', 'Connections, credentials and models'),
    description: tr(
      '配置模型服务与关联账户，保存后对新的调用生效。',
      'Model providers and linked accounts. Saved changes apply to new calls.',
    ),
  },
  {
    id: 'tools',
    icon: 'tool',
    label: tr('工具', 'Tools'),
    summary: tr('内置工具与 Shell', 'Built-in tools and the shell'),
    description: tr(
      '新会话默认启用的内置工具，以及 Shell 执行命令的环境。',
      'Built-in tools new sessions start with, and where the shell runs commands.',
    ),
  },
  {
    id: 'image_generation',
    icon: 'image',
    label: tr('图片生成', 'Image generation'),
    summary: tr('生图服务、模型与账户', 'Image services, models and accounts'),
    description: tr('生成图片并保存到会话 blob。', 'Generate images into session blob storage.'),
  },
  {
    id: 'fetch',
    icon: 'web-reader',
    label: tr('网页读取', 'Web fetch'),
    summary: tr('网页内容读取服务', 'Page reading services'),
    description: tr('独立选择网页读取提供商及其账户。', 'Configure webpage readers and their accounts.'),
  },
  {
    id: 'search',
    icon: 'web-search',
    label: tr('联网搜索', 'Web search'),
    summary: tr('Web Search 用哪些搜索服务', 'The services Web Search asks'),
    description: tr(
      'Web Search 工具按顺序询问这些搜索提供商。各服务可以复用公共账户池中的凭据。',
      'The Web Search tool asks these providers in order. Services can share credentials from the account pool.',
    ),
  },
  {
    id: 'mcp',
    icon: 'mcp',
    label: 'MCP',
    summary: tr('会话可以调用的 MCP 服务器', 'MCP servers sessions can call'),
    description: tr(
      '智能体在会话的 Shell 里调用这些服务器。保存后从下一次调用开始生效。',
      "Servers the agent calls from a session's shell. Saved changes apply from the next call.",
    ),
  },
  {
    id: 'skills',
    icon: 'skill',
    label: tr('Skill', 'Skills'),
    summary: tr('智能体按需查找和读取的 Skill', 'Skills the agent finds and reads as needed'),
    description: tr(
      '智能体在会话的 Shell 里查找和读取这些 Skill。保存后从下一条命令开始生效。',
      "Skills the agent finds and reads from a session's shell. Saved changes apply from the next command.",
    ),
  },
  {
    id: 'network',
    icon: 'network',
    label: tr('网络', 'Network'),
    summary: tr('各服务共用的网络代理', 'Shared network proxy'),
    description: tr(
      '账户登录、模型、搜索、网页读取和 MCP 共用的代理设置。',
      'Proxy settings shared by account sign-in, models, search, webpage readers and MCP.',
    ),
  },
  {
    id: 'ui',
    icon: 'appearance',
    label: tr('界面', 'Interface'),
    summary: tr('外观、通知与本地偏好', 'Appearance, notifications and preferences'),
    description: tr(
      '外观、输入与本地数据，只保存在这个浏览器中。',
      'Appearance, input and local data, stored in this browser only.',
    ),
  },
  {
    id: 'debug',
    icon: 'diagnostics',
    label: tr('调试', 'Debug'),
    summary: tr('连接诊断与引导预览', 'Diagnostics and setup preview'),
    description: tr(
      '检查与服务器的连接，预览首次使用引导。这里不会修改任何配置。',
      'Check the connection to the server and preview the first-run setup. Nothing here changes your configuration.',
    ),
  },
]);
