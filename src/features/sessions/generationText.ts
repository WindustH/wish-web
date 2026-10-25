/** Plain stored content, without Markdown rendering or display-summary substitution. */
export function generationText(message: Record<string, any>): string {
  const [role, value] = Object.entries(message)[0] ?? ['', {}];
  const json = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (role === 'ToolUse') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.arguments)}`;
  if (role === 'ToolResult') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.content)}`;
  if (Array.isArray(value.content)) return value.content.map((block: any) => block.Text ? block.Text.text : json(block)).join('\n\n');
  if (role === 'Reasoning') return ['plaintext', 'display', 'signature', 'ciphertext', 'opaque_kind', 'replay_item'].filter(key => value[key] != null && value[key] !== '').map(key => `${key}:\n${json(value[key])}`).join('\n\n');
  if (role === 'UpstreamCompaction') return json(value);
  return json(value);
}
