// Shared display helper; configuration now has one HTTP owner.
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
