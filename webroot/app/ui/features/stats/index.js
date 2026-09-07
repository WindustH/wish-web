import { i18n } from '../../../core/i18n/index.js';
import { StatsView } from './view.js';
export default {
  id: 'stats',
  nav: [{ id: 'stats', icon: 'chart-column', path: '/stats', label: () => i18n.t('nav.stats'), position: 'top' }],
  routes: [{ pattern: '/stats', view: StatsView }],
};
