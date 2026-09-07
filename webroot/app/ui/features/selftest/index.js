import { i18n } from '../../../core/i18n/index.js';
import { SelftestView } from './view.js';
export default {
  id: 'selftest',
  nav: [],   // reachable from settings; hidden from bars
  routes: [{ pattern: '/selftest', view: SelftestView }],
};
