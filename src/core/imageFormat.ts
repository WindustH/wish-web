// File names and browser-provided MIME types are hints; signatures describe the actual bytes.
export function imageFormat(buffer: ArrayBuffer): string | undefined {
  const bytes = new Uint8Array(buffer);
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png';
  if (starts(255, 216, 255)) return 'image/jpeg';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (starts(73, 73, 42, 0) || starts(77, 77, 0, 42)) return 'image/tiff';
  if (ascii(4, 8) === 'ftyp') {
    const brands = ascii(8, Math.min(bytes.length, 40));
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return 'image/heif';
    if (/avif|avis/.test(brands)) return 'image/avif';
  }
  return undefined;
}
export function supportedImageMime(buffer: ArrayBuffer): string | undefined {
  const mime = imageFormat(buffer);
  return mime && supportedModelImageMime(mime) ? mime : undefined;
}

export const supportedModelImageMime = (mime: string) =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'].includes(mime);
