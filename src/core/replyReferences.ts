/** Durable coordinates use original Markdown UTF-16 offsets or top-left media coordinates. */
export type ReplyReference = {
  id: string;
  session: string;
  source: string;
  label: string;
  text: string;
  seq?: number;
  block?: number;
  start?: number;
  end?: number;
  blob?: string;
  fileName?: string;
  lineStart?: number;
  lineEnd?: number;
  version?: string;
  imageId?: string;
  page?: number;
  /** Video playback position in seconds, independent of playback speed. */
  time?: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    unit: 'px' | 'pt';
  };
};
export type ReplyLink = { input: number; reply: number; references: ReplyReference[] };
export function validReference(value: unknown): value is ReplyReference {
  if (!value || typeof value !== 'object') return false;
  const v = value as ReplyReference;
  return (
    typeof v.id === 'string' &&
    typeof v.session === 'string' &&
    typeof v.source === 'string' &&
    typeof v.label === 'string' &&
    typeof v.text === 'string' &&
    v.text.length <= 16000 &&
    (v.time === undefined || (Number.isFinite(v.time) && v.time >= 0)) &&
    (v.seq === undefined || (Number.isSafeInteger(v.seq) && v.seq >= 0)) &&
    (v.lineStart === undefined ||
      (Number.isSafeInteger(v.lineStart) &&
        v.lineStart > 0 &&
        Number.isSafeInteger(v.lineEnd) &&
        v.lineEnd! >= v.lineStart)) &&
    (v.start === undefined ||
      (Number.isSafeInteger(v.start) && v.start >= 0 && Number.isSafeInteger(v.end) && v.end! >= v.start))
  );
}
export function referenceDescription(ref: ReplyReference) {
  if (ref.region)
    return (
      `[Reference: ${ref.label}; file=${ref.blob}${ref.page ? `; page=${ref.page}` : ''}${ref.time === undefined ? '' : `; time=${ref.time}s`}; ` +
      `coordinates(top-left, ${ref.region.unit})=${JSON.stringify(ref.region)}; the following image is the selected region.]`
    );
  const header = ref.blob
    ? `[Reference: ${JSON.stringify(ref.fileName ?? ref.label)}; file=${ref.blob}${ref.lineStart === undefined ? '' : `; lines=${ref.lineStart}:${ref.lineEnd}`}; source range ${ref.start}:${ref.end}]`
    : `[Reply to message ${ref.seq}, text block ${ref.block}, source range ${ref.start}:${ref.end}]`;
  return (
    header +
    '\n' +
    ref.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  );
}

/** getRandomValues also works for LAN HTTP deployments (randomUUID requires a secure context). */
export function replyReferenceId(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((value) => value.toString(16).padStart(2, '0')).join('');
}
