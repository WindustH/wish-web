// Presentation only; requests and configuration keep the original model ID. A lone digit pair is a
// version spelled with a dash (`claude-opus-5-5`), so it reads with its dot again.
export const modelLabel = (id: string) =>
  id.replace(/(^|[-_])(\d)-(\d)(?=$|[-_])/g, '$1$2.$3').replace(/[-_]/g, ' ').toUpperCase();
