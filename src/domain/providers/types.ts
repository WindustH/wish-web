import type { SelectOption as BaseSelectOption } from '../../ui/selectTypes.ts';
export interface PickerItem {
  key: string;
  title: string;
  description?: string;
  search?: string;
  group?: string;
  groupKey?: string;
  brand?: string;
  icon?: string;
  alwaysVisible?: boolean;
  disabled?: boolean;
}
export interface SelectOption extends BaseSelectOption {
  brand?: string;
}
