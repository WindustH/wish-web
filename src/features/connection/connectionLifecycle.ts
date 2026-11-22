import { watch } from 'vue';
import { bus } from '../../core/bus.ts';
import { signOut } from '../../core/connection.ts';
import { errorDetail } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { sync } from '../../core/state/syncSlice.ts';
import { dismissToast, toast } from '../../ui/toast.ts';

export function reconnectStreams() {
  if (document.hidden || sync.authorizationDenied.value) return;
  sync.reconnectNow();
  chat.reconnectNow();
}

export function installConnectionLifecycle(checkSsh?: () => void) {
  let connectionNotice: number | undefined;
  let authNotice: number | undefined;
  function clearConnectionNotice() {
    if (connectionNotice !== undefined) dismissToast(connectionNotice);
    connectionNotice = undefined;
  }
  function reconnect() {
    if (document.hidden || sync.authorizationDenied.value) return;
    reconnectStreams();
    checkSsh?.();
  }
  const stopState = watch(sync.state, (state) => {
    if (state !== 'disconnected') clearConnectionNotice();
    else if (connectionNotice === undefined && authNotice === undefined) {
      connectionNotice = toast(
        tr('暂时无法连接到服务器，仍在尝试重连', 'Unable to reach the server. Still trying to reconnect.'),
        {
          tone: 'warning',
          persistent: true,
          action: { label: tr('立即重试', 'Retry now'), run: reconnect, keepOpen: true },
        },
      );
    }
  });
  const stopDenied = bus.on('connection.denied', () => {
    clearConnectionNotice();
    if (authNotice !== undefined) return;
    authNotice = toast(
      tr('服务器拒绝了当前凭据，请重新登录。', 'The server refused these credentials. Sign in again.'),
      {
        tone: 'error',
        persistent: true,
        action: {
          label: tr('重新登录', 'Sign in again'),
          run: () => void signOut().catch((cause) => toast(errorDetail(cause), { tone: 'error' })),
        },
      },
    );
  });

  function updateVisibility() {
    sync.setVisible(!document.hidden);
    chat.setVisible(!document.hidden);
  }
  function visibilityChanged() {
    updateVisibility();
    reconnect();
  }
  function pageShown(event: PageTransitionEvent) {
    if (event.persisted) visibilityChanged();
  }
  updateVisibility();
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pageshow', pageShown);
  window.addEventListener('online', reconnect);
  return () => {
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pageshow', pageShown);
    window.removeEventListener('online', reconnect);
    stopState();
    stopDenied();
    clearConnectionNotice();
    if (authNotice !== undefined) dismissToast(authNotice);
  };
}
