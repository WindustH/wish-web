export type InstructionKind =
  'base' | 'supplemental' | 'mcp' | 'skills' | 'sessions-groups' | 'upstream-compaction' | 'summary' | 'initial-tools';
export interface InstructionSection {
  kind: InstructionKind;
  content: string;
  supplemental: boolean;
}
/** Split Wish's known instruction sections, keeping stored text distinct from current supplements. */
export function instructionSections(text: string, preview?: string) {
  const kinds: Record<string, InstructionKind> = {
    'MCP servers': 'mcp',
    Skills: 'skills',
    'Sessions and groups': 'sessions-groups',
  };
  const split = (value: string): InstructionSection[] =>
    value
      .split(/\n\n(?=# (?:MCP servers|Skills|Sessions and groups)\n)/)
      .filter(Boolean)
      .map((content, index) => ({
        kind: kinds[content.match(/^# (.*)\n/)?.[1] ?? ''] ?? (index === 0 ? 'base' : 'supplemental'),
        content,
        supplemental: false,
      }));
  const stored = split(text);
  // Old sessions only saved the base instruction. Never replace their stored wording.
  if (preview && stored.length === 1 && !text.includes('\n# ')) {
    stored.push(
      ...split(preview)
        .slice(1)
        .map((section) => ({ ...section, supplemental: true })),
    );
  }
  return stored;
}
