// Decoded preview artifacts only, never entire media files or expiring URLs.
export class PreviewCache {
  private entries = new Map<string, { value: Blob | null; at: number }>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly ttl: number;
  constructor(maxBytes = 32 * 1024 * 1024, maxEntries = 64, ttl = 10 * 60 * 1000) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.ttl = ttl;
  }
  get(key: string): Blob | null | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= this.ttl) {
      this.remove(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: Blob | null) {
    this.remove(key);
    if ((value?.size ?? 0) > this.maxBytes) return;
    this.entries.set(key, { value, at: Date.now() });
    this.bytes += value?.size ?? 0;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries)
      this.remove(this.entries.keys().next().value!);
  }
  private remove(key: string) {
    this.bytes -= this.entries.get(key)?.value?.size ?? 0;
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
export const previewCache = new PreviewCache();
