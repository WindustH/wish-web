import { i18n } from '../../../core/i18n/index.js';
import { SettingsView } from './view.js';
export default {
  id: 'settings',
  nav: [{ id: 'settings', icon: 'settings', path: '/settings', label: () => i18n.t('nav.settings'), position: 'bottom' }],
  routes: [{ pattern: '/settings', view: SettingsView }],
};
