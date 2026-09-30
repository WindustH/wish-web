// Turning what was thrown into words for the user.

/** An error's own message, or the value itself as text. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What went wrong in the server's words when it sent any (an API error's `detail`), else the
 *  error's own message. */
export function errorDetail(error: unknown): string {
  const value = error as { detail?: unknown; message?: unknown } | null | undefined;
  if (typeof value?.detail === 'string' && value.detail) return value.detail;
  if (typeof value?.message === 'string' && value.message) return value.message;
  return String(error ?? '');
}
