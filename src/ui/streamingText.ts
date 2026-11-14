/** Coalesce streamed text for rendering; flush explicitly at completion. */
export function streamingText(render: (text: string) => void) {
  let latest = '';
  let displayed = '';
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = 0;
    timer = undefined;
  };
  const flush = () => {
    cancel();
    if (displayed === latest) return;
    displayed = latest;
    render(latest);
  };
  return {
    write(text: string) {
      latest = text;
      if (!text || !displayed) {
        flush();
        return;
      }
      if (frame || timer !== undefined) return;
      if (text.length > 4000) timer = setTimeout(flush, 200);
      else frame = requestAnimationFrame(flush);
    },
    flush,
    cancel,
  };
}
