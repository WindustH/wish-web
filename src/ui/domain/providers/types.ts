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
export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  brand?: string;
  annotation?: string;
  description?: string;
  disabled?: boolean;
}
