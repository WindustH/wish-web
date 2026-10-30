import { onBeforeUnmount, ref, watch } from 'vue';
import {
  browserLoginComplete,
  browserLoginStart,
  browserLoginStatus,
  type BrowserLoginKind,
} from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';

/** Browser OAuth with a local callback, or a pasted redirect for remote servers. */
export function useBrowserLogin(
  provider: () => string,
  kind: () => BrowserLoginKind,
  save: (() => Promise<boolean>) | undefined,
  onComplete: () => void,
) {
  const busy = ref(false);
  const url = ref('');
  const message = ref('');
  const callbackUrl = ref('');
  const submitting = ref(false);
  let alive = true;
  let generation = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let popup: Window | null = null;
  onBeforeUnmount(() => {
    alive = false;
    generation++;
    popup?.close();
    if (poll) clearTimeout(poll);
  });
  watch([provider, kind], () => {
    generation++;
    if (poll) clearTimeout(poll);
    popup?.close();
    busy.value = false;
    url.value = '';
    message.value = '';
    callbackUrl.value = '';
  });
  const name = () => (kind() === 'google' ? 'Google' : 'ChatGPT');
  const failed = (error: unknown) => showError({ title: tr(`${name()} 登录失败`, `${name()} sign-in failed`), error });
  const succeeded = () => {
    if (!alive) return;
    generation++;
    if (poll) clearTimeout(poll);
    popup?.close();
    busy.value = false;
    message.value = tr(`${name()} 登录成功，凭据已保存。`, `${name()} sign-in succeeded. Credentials were saved.`);
    onComplete();
  };

  async function pollStatus() {
    const attempt = generation;
    const valid = () => alive && attempt === generation;
    if (!valid()) return;
    try {
      const result = await browserLoginStatus(provider(), kind());
      if (!valid()) return;
      if (result.status === 'complete') return succeeded();
      if (result.status === 'failed' || result.status === 'expired') {
        busy.value = false;
        failed(result.error || tr('登录未完成，请重试。', 'Sign-in did not complete. Try again.'));
        return;
      }
      poll = setTimeout(pollStatus, 1500);
    } catch (error) {
      if (!valid()) return;
      busy.value = false;
      failed(error);
    }
  }

  async function start() {
    if (!alive || busy.value) return;
    const attempt = ++generation;
    const valid = () => alive && attempt === generation;
    if (submitting.value) return;
    if (poll) clearTimeout(poll);
    popup?.close();
    // Opened now, while the click still allows it; the address follows once the server has it.
    const opened = window.open('', '_blank');
    popup = opened;
    if (opened) opened.opener = null;
    busy.value = true;
    url.value = '';
    message.value = '';
    callbackUrl.value = '';
    try {
      // A failed save has already said why.
      if (save && !(await save())) {
        opened?.close();
        busy.value = false;
        return;
      }
      if (!valid()) {
        opened?.close();
        return;
      }
      const result = await browserLoginStart(provider(), kind());
      if (!valid()) {
        opened?.close();
        return;
      }
      url.value = result.authorization_url;
      if (opened) opened.location.href = result.authorization_url;
      message.value = tr(`请在打开的 ${name()} 页面完成授权。`, `Complete authorization in the ${name()} page.`);
      poll = setTimeout(pollStatus, 1500);
    } catch (error) {
      opened?.close();
      if (!valid()) return;
      busy.value = false;
      failed(error);
    }
  }

  async function complete() {
    if (submitting.value || !callbackUrl.value.trim()) return;
    submitting.value = true;
    const attempt = generation;
    const valid = () => alive && attempt === generation;
    try {
      await browserLoginComplete(provider(), kind(), callbackUrl.value.trim());
      if (!valid()) return;
      if (poll) clearTimeout(poll);
      callbackUrl.value = '';
      popup?.close();
      popup = null;
      succeeded();
    } catch (error) {
      if (valid()) failed(error);
    } finally {
      submitting.value = false;
    }
  }

  return { busy, url, message, callbackUrl, submitting, start, complete };
}
