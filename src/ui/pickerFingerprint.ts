/** A provider's identity is stable even while its display name is loading. */
export interface PickerGroupItem { key: string; group?: string; groupKey?: string }
export function pickerHeading(item: PickerGroupItem, previous?: PickerGroupItem): boolean {
  return item.groupKey ? item.groupKey !== previous?.groupKey : !!item.group && item.group !== previous?.group;
}
/** Reka caches virtual rows by index; changed row identities or heading
 * positions require a fresh virtualizer. Display-name changes do not. */
export function pickerFingerprint(items: readonly PickerGroupItem[]): string {
  return JSON.stringify(items.map((item, index) => [item.key, pickerHeading(item, items[index - 1])]));
}
