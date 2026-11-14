import type { InstructionKind } from '../../core/instructions.ts';
import { tr } from '../../core/i18n/tr.ts';
export function instructionLabel(kind: InstructionKind): string {
  const labels: Record<InstructionKind, string> = {
    base: tr('系统指令', 'System instructions'),
    supplemental: tr('附加指令', 'Additional instructions'),
    mcp: tr('MCP 使用指令', 'MCP instructions'),
    skills: tr('技能使用指令', 'Skill instructions'),
    'sessions-groups': tr('会话协作指令', 'Session collaboration instructions'),
    'upstream-compaction': tr('上游上下文压缩', 'Upstream context compaction'),
    compaction: tr('上下文已压缩', 'Context compacted'),
    summary: tr('上下文摘要', 'Context summary'),
    'image-delivery': tr('图片发送状态', 'Image delivery'),
    'image-input': tr('图片输入说明', 'Image input'),
    'initial-tools': tr('工具定义 · Generation #0', 'Tool definitions · Generation #0'),
  };
  return labels[kind];
}
