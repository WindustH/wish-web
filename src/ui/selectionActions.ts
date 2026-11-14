import type { MenuItem } from './components/menuTypes.ts';

/** Selection owners supply the same actions to native menus and touch toolbars. */
export interface SelectionActions {
  items(): MenuItem[];
  select(key: string): void;
}
export interface SelectionActionRequest {
  range: Range;
  actions?: SelectionActions;
}
export function selectionActions(root: Element, range: Range): SelectionActions | undefined {
  const detail: SelectionActionRequest = { range };
  root.dispatchEvent(new CustomEvent('wish-selection-actions', { bubbles: true, detail }));
  return detail.actions;
}
