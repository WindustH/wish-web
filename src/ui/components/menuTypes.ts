export type MenuItem = {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  shortcut?: string;
  separator?: boolean;
  checked?: boolean;
  role?: 'menuitemcheckbox';
  disabled?: boolean;
  children?: Omit<MenuItem, 'children'>[];
};
