// Sessions feature: list pane + conversation + per-session sub-views.
import { i18n } from '../../../core/i18n/index.js';
import { SessionsView } from './list.js';
import { ChatView } from './chat.js';

export default {
  id: 'sessions',
  nav: [{ id: 'sessions', icon: 'message-circle', path: '/sessions', label: () => i18n.t('nav.sessions'), position: 'top' }],
  routes: [
    { pattern: '/sessions', view: SessionsView },
    { pattern: '/s/:id', view: ChatView },          // chat (desktop two-pane / mobile page)
    { pattern: '/s/:id/info', view: ChatView },
    { pattern: '/s/:id/search', view: ChatView },
    { pattern: '/s/:id/manage', view: ChatView },
  ],
};
