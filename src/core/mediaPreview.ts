import { isApiUrl } from './api/client.ts';

export function imagePreviewUrl(src: string, width: 384 | 768 | 1536, original: boolean): string {
  if (original || !isApiUrl(src)) return src;
  const parsed = new URL(src, globalThis.location?.href);
  if (!/\/(?:sessions|groups)\/[^/]+\/blobs\/[a-f0-9]{64}$/.test(parsed.pathname)) return src;
  parsed.pathname += '/image';
  parsed.search = `?width=${width}`;
  return parsed.href;
}
