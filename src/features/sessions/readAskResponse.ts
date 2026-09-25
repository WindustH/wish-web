// /ask normally streams normalized model events, but some model protocols
// return a complete response even when streaming was requested.
interface AskResult { messages?: { Assistant?: { content?: { Text?: { text?: unknown } }[] } }[] }

export async function readAskResponse(response: Response, onText: (text: string) => void): Promise<void> {
  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.error?.message || body.detail || detail;
    } catch { /* Keep the HTTP status when the error body is not JSON. */ }
    throw new Error(detail);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const result: AskResult = await response.json();
    const answer = (result.messages || []).flatMap(message =>
      (message.Assistant?.content || []).flatMap(block =>
        typeof block.Text?.text === 'string' ? [block.Text.text] : [],
      ),
    ).join('\n\n');
    if (!answer) throw new Error('The model returned no answer text.');
    onText(answer);
    return;
  }

  if (!response.body) throw new Error('The response stream is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  let receivedText = false;
  const processFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (event === 'done') { finished = true; return; }
    const parsed = JSON.parse(data);
    if (event === 'error') throw new Error(parsed.message || 'The model request failed.');
    if (event !== 'model_event') return;
    if (typeof parsed.TextDelta?.delta === 'string' && parsed.TextDelta.delta) {
      onText(parsed.TextDelta.delta);
      receivedText = true;
    }
    if (parsed.Stop === 'MaxOutputLengthExceeded') throw new Error('The answer reached the output limit.');
  };
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        processFrame(frame);
        if (finished) break;
      }
    }
    if (!finished && buffer.trim()) processFrame(buffer);
    if (!finished) throw new Error('The response connection ended early.');
    if (!receivedText) throw new Error('The model returned no answer text.');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
