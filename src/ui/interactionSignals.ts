// Optional observations of UI gestures. Components know neither the recorder nor its storage.
type InteractionSignal =
  { type: 'swallowed-click'; by: string } | { type: 'touch-action'; name: string; completed: () => boolean };
const observers = new Set<(signal: InteractionSignal) => void>();
export function observeInteractions(observer: (signal: InteractionSignal) => void) {
  observers.add(observer);
  return () => observers.delete(observer);
}
export function noteSwallowedClick(by: string) {
  if (observers.size) for (const observer of observers) observer({ type: 'swallowed-click', by });
}
export function noteTouchAction(name: string, completed: () => boolean) {
  if (observers.size) for (const observer of observers) observer({ type: 'touch-action', name, completed });
}
