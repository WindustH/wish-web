/** Plain stored content, without Markdown rendering or display-summary substitution. */
export function generationText(message: Record<string, any>): string {
  const [role, value] = Object.entries(message)[0] ?? ['', {}];
  const json = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (role === 'ToolUse') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.arguments)}`;
  if (role === 'ToolResult') return `${value.name}\ncall_id: ${value.call_id}\n\n${json(value.content)}`;
  if (Array.isArray(value.content))
    return value.content.map((block: any) => (block.Text ? block.Text.text : json(block))).join('\n\n');
  if (role === 'Reasoning')
    return ['plaintext', 'display', 'signature', 'ciphertext', 'opaque_kind', 'replay_item']
      .filter((key) => value[key] != null && value[key] !== '')
      .map((key) => `${key}:\n${json(value[key])}`)
      .join('\n\n');
  if (role === 'UpstreamCompaction') return json(value);
  return json(value);
}

/** Stored execution data and the protocol's model-facing text, without UI-only metadata. */
export function generationToolResult(message: Record<string, any>) {
  const result = message.ToolResult;
  if (!result) return null;
  const content = result.content;
  const projected =
    content !== null &&
    typeof content === 'object' &&
    (typeof content.model_text === 'string' || Object.hasOwn(content, 'model_value'));
  const execution = projected
    ? Object.fromEntries(Object.entries(content).filter(([key]) => key !== 'model_text' && key !== 'model_value'))
    : content;
  const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return {
    execution: text(execution),
    model: projected
      ? Object.hasOwn(content, 'model_value')
        ? text(content.model_value)
        : (content.model_text as string)
      : text(content),
    projected,
  };
}
