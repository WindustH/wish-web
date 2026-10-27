import type { InstructionKind } from '../../core/instructions.ts';
import { tr } from '../../core/i18n/tr.ts';
export function instructionLabel(kind: InstructionKind): string {
  const labels: Record<InstructionKind, string> = {
    base: tr('系统指令', 'System instructions'),
    supplemental: tr('附加指令', 'Additional instructions'),
    mcp: tr('MCP 使用指令', 'MCP instructions'),
    skills: tr('技能使用指令', 'Skill instructions'),
    'sessions-groups': tr('会话与群组协作指令', 'Session and group instructions'),
    'upstream-compaction': tr('上游上下文压缩', 'Upstream context compaction'),
    summary: tr('上下文摘要', 'Context summary'),
    'initial-tools': tr('工具定义 · Generation #0', 'Tool definitions · Generation #0'),
  };
  return labels[kind];
}
