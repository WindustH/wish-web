/** Preserve input order while limiting concurrent work. The request owner supplies cancellation. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        result[index] = await run(items[index]!);
      }
    }),
  );
  return result;
}
