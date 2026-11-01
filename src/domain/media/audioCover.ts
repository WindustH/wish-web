import { apiFetch } from '../../core/api/client.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';

/** Read tags with ranged requests, including covers stored after the audio payload. */
export async function audioCover(src: string, size: number, mime: string, signal: AbortSignal): Promise<Blob | null> {
  const scope = createAbortScope([signal], 10000);
  try {
    const [{ tokenizer }, { parseFromTokenizer, selectCover }] = await Promise.all([
      import('@tokenizer/range'),
      import('music-metadata'),
    ]);
    scope.signal.throwIfAborted();
    let remaining = 4 * 1024 * 1024;
    let requests = 0;
    const info = { size, mimeType: mime, acceptPartialRequests: true };
    const reader = await tokenizer(
      {
        getHeadInfo: async () => info,
        async getResponse(_, range) {
          scope.signal.throwIfAborted();
          if (!range || ++requests > 32 || range[1] - range[0] + 1 > remaining)
            throw new Error('Cover metadata exceeds preview budget');
          remaining -= range[1] - range[0] + 1;
          const response = await apiFetch(src, {
            signal: scope.signal,
            headers: { Range: `bytes=${range[0]}-${range[1]}` },
          });
          if (response.status !== 206) {
            await response.body?.cancel();
            throw new Error('Cover metadata requires range support');
          }
          return { ...info, arrayBuffer: async () => new Uint8Array(await response.arrayBuffer()) };
        },
        abort() {},
      },
      { abortSignal: scope.signal, minimumChunkSize: 16384 },
    );
    try {
      const metadata = await parseFromTokenizer(reader, { duration: false, skipPostHeaders: true });
      scope.signal.throwIfAborted();
      const picture = selectCover(metadata.common.picture);
      return picture && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(picture.format)
        ? new Blob([new Uint8Array(picture.data)], { type: picture.format })
        : null;
    } finally {
      await reader.close();
    }
  } finally {
    scope.dispose();
  }
}
