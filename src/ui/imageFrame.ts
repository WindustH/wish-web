import { createBoundedCache } from '../core/util/boundedCache.ts';
import { getConnectionScope } from '../core/api/client.ts';

const sizes = createBoundedCache(1024, 256 * 1024);
const key = (src: string) => getConnectionScope() + '\n' + src;

export function frameSize(src: string, dimensions?: readonly number[]) {
  const known = !dimensions && src.length < 2048 && sizes.get(key(src));
  const [width, height] = dimensions ?? (known ? known.split('x').map(Number) : []);
  if (width && height && Number.isFinite(width / height) && width > 0 && height > 0)
    return { '--image-ratio': String(width / height), '--image-width': width + 'px' };
  return {};
}
export function rememberImage(src: string, img: HTMLImageElement) {
  if (src.length < 2048 && img.naturalWidth && img.naturalHeight)
    sizes.set(key(src), img.naturalWidth + 'x' + img.naturalHeight);
}
