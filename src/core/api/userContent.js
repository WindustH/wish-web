// Use persisted display parts when available; native history remains readable.
export function orderedUserContent(message, sessionId, fallback) {
  const parts = message.metadata?.input_parts;
  const attachments = message.metadata?.attachments ?? [];
  if (!Array.isArray(parts)) return fallback;
  return parts.flatMap(part => {
    if (part.type === 'text') return [{ type: 'text', text: part.text }];
    const file = attachments[part.index];
    return file ? [{ type: file.kind, blob_id: `${sessionId}/${file.id}`, filename: file.name,
      image_id: file.id, byte_count: file.byte_count, placeholder: file.placeholder }] : [];
  });
}
export function userBubbles(content) {
  const bubbles = [];
  for (const block of content ?? []) {
    if (block.type === 'text') {
      if (!block.text) continue;
      const previous = bubbles.at(-1);
      if (previous?.type === 'text') previous.text += block.text;
      else bubbles.push({ ...block });
    } else if (block.type === 'image' || block.type === 'file') bubbles.push(block);
  }
  return bubbles.filter(block => block.type !== 'text' || block.text.trim());
}
