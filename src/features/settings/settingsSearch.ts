// Search labels and aliases only; credentials and configuration values are never indexed.
export const settingTerms: Record<string, string[]> = {
  service: ['默认模型 Default model', '提示词 Instructions System prompt', '工作目录 Working directory cwd', '上下文自动压缩 Context compaction', '推理强度 Reasoning effort'],
  accounts: ['API Key 密钥 token 凭据 Credentials', '账户登录 OAuth Sign in', '账户名称 Account name', '登录与续期代理 Login proxy'],
  providers: ['模型提供商 Model provider', '接口地址 Base URL endpoint', '认证 Authentication', '模型列表 Models', '上下文上限 Context limit', '输出上限 Max output tokens'],
  tools: ['Shell 终端 执行命令', '内置工具 Built-in tools', '工具权限 Tool permissions', '超时 Timeout'],
  fetch: ['网页读取 Web fetch reader', '读取提供商 Reader provider'],
  search: ['联网搜索 Web search', '搜索提供商 Search provider'],
  mcp: ['MCP 服务器 Server', '命令 Command', '环境变量 Environment variables', '身份验证 Authentication', '使用代理 Proxy'],
  skills: ['Skill 技能', '目录 路径 Directory path'],
  network: ['网络代理 Network proxy', '代理模式 Proxy mode', '系统环境变量 Environment variables', '代理地址 Proxy URL', '用户名 密码 Username password', '直连 Direct connection'],
  ui: ['主题 外观 深色 浅色 Theme appearance dark light', '语言 Language', '字体 Font', '通知 Notifications', '发送快捷键 Send Enter', '保持唤醒 Keep awake', '本地数据 Local data'],
  debug: ['调试模式 用户行为日志 记录 导出 Debug activity log record export', '样式预览 卡片 群组 Style preview cards session groups', '诊断 Diagnostics', '滚动卡死记录 Scroll freeze', '初始引导 Setup onboarding', '连接 Connection'],
};
type Section = {id:string;label:string;summary:string;description:string};
const normalize = (text:string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]+/g,' ').trim();
export function searchSettings<T extends Section>(sections:T[],query:string) {
  const words=normalize(query).split(' ').filter(Boolean);
  return sections.map(section=>{
    const terms=settingTerms[section.id]??[];
    const label=normalize(section.label);
    const all=normalize([section.label,section.summary,section.description,...terms].join(' '));
    const matches=words.every(word=>all.includes(word));
    const hint=terms.find(term=>words.length&&words.every(word=>normalize(term).includes(word)))??section.summary;
    const score=words.length&&words.every(word=>label.includes(word))?1:0;
    return {...section,searchHint:hint,matches,score};
  }).filter(section=>section.matches).sort((a,b)=>b.score-a.score);
}
