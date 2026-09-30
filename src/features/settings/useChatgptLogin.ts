import { onBeforeUnmount, ref } from 'vue';
import { chatgptLoginComplete, chatgptLoginStart, chatgptLoginStatus } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';

/**
 * Signing a Codex provider in with ChatGPT. `start` saves the settings first (the server signs in
 * the saved provider), opens the sign-in page in a new tab and watches for the credentials to
 * arrive. When the browser cannot reach the server's callback, `complete` takes the redirect URL
 * pasted from the address bar instead.
 */
export function useChatgptLogin(provider: () => string, save: (() => Promise<boolean>) | undefined, onComplete: () => void) {
  const busy = ref(false);
  const url = ref('');
  const message = ref('');
  const callbackUrl = ref('');
  const submitting = ref(false);
  let poll: ReturnType<typeof setTimeout> | undefined;
  let popup: Window | null = null;
  onBeforeUnmount(() => { if (poll) clearTimeout(poll); });
  const failed = (error: unknown) => showError({ title: tr('ChatGPT 登录失败', 'ChatGPT sign-in failed'), error });
  const succeeded = () => {
    busy.value = false;
    message.value = tr('ChatGPT 登录成功，凭据已保存。', 'ChatGPT sign-in succeeded. Credentials were saved.');
    onComplete();
  };

  async function watch() {
    try {
      const result = await chatgptLoginStatus(provider());
      if (result.status === 'complete') return succeeded();
      if (result.status === 'failed' || result.status === 'expired') {
        busy.value = false;
        failed(result.error || tr('登录未完成，请重试。', 'Sign-in did not complete. Try again.'));
        return;
      }
      poll = setTimeout(watch, 1500);
    } catch (error) {
      busy.value = false;
      failed(error);
    }
  }

  async function start() {
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
      const result = await chatgptLoginStart(provider());
      url.value = result.authorization_url;
      if (opened) opened.location.href = result.authorization_url;
      message.value = tr('请在打开的 ChatGPT 页面完成授权。', 'Complete authorization in the ChatGPT page.');
      poll = setTimeout(watch, 1500);
    } catch (error) {
      opened?.close();
      busy.value = false;
      failed(error);
    }
  }

  async function complete() {
    if (submitting.value || !callbackUrl.value.trim()) return;
    submitting.value = true;
    try {
      await chatgptLoginComplete(provider(), callbackUrl.value.trim());
      if (poll) clearTimeout(poll);
      callbackUrl.value = '';
      popup?.close();
      popup = null;
      succeeded();
    } catch (error) {
      failed(error);
    } finally {
      submitting.value = false;
    }
  }

  return { busy, url, message, callbackUrl, submitting, start, complete };
}
