// PDF covers and decoded video frames are opaque, bounded canvases. Some engines
// substitute PNG when WebP encoding is unavailable; keep the smaller fallback.
export async function encodeThumbnail(canvas: HTMLCanvasElement): Promise<Blob> {
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  const result = jpeg && (!webp || jpeg.size < webp.size) ? jpeg : webp;
  if (!result) throw new Error('Thumbnail encoding failed');
  return result;
}
