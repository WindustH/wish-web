/** Split Wish's known instruction sections, keeping stored text distinct from current supplements. */
export function instructionSections(text: string, preview?: string) {
  const titles: Record<string, string> = { 'MCP servers': 'MCP 使用指令', Skills: '技能使用指令', 'Sessions and groups': '会话与群组协作指令' };
  const split = (value: string) => value.split(/\n\n(?=# (?:MCP servers|Skills|Sessions and groups)\n)/).filter(Boolean).map((content, index) => ({
    title: titles[content.match(/^# (.*)\n/)?.[1] ?? ''] ?? (index === 0 ? '系统指令' : '附加指令'), content, supplemental: false,
  }));
  const stored = split(text);
  // Old sessions only saved the base instruction. Never replace their stored wording.
  if (preview && stored.length === 1 && !text.includes('\n# ')) {
    stored.push(...split(preview).slice(1).map(section => ({ ...section, supplemental: true })));
  }
  return stored;
}
