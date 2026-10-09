import { onBeforeUnmount, ref } from 'vue';
import { copilotLoginStart, copilotLoginStatus } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';

/**
 * Signing a Copilot provider in with GitHub's device flow. `start` saves the settings first (the
 * server signs in the saved provider), shows the code to type and opens GitHub's page for it in a
 * new tab, then watches until the server has the credentials. The page can be opened on any
 * machine, so nothing needs pasting back.
 */
export function useCopilotLogin(provider: () => string, save: (() => Promise<boolean>) | undefined, onComplete: () => void) {
  const busy = ref(false);
  const url = ref('');
  const code = ref('');
  const message = ref('');
  let poll: ReturnType<typeof setTimeout> | undefined;
  onBeforeUnmount(() => { if (poll) clearTimeout(poll); });
  const failed = (error: unknown) => showError({ title: tr('GitHub 登录失败', 'GitHub sign-in failed'), error });

  async function watch() {
    try {
      const result = await copilotLoginStatus(provider());
      if (result.status === 'complete') {
        busy.value = false;
        code.value = '';
        message.value = tr('GitHub 登录成功，凭据已保存。', 'GitHub sign-in succeeded. Credentials were saved.');
        onComplete();
        return;
      }
      if (result.status === 'failed' || result.status === 'expired') {
        busy.value = false;
        code.value = '';
        message.value = '';
        failed(result.error || (result.status === 'expired'
          ? tr('验证码已过期，请重新登录。', 'The code expired. Sign in again.')
          : tr('登录未完成，请重试。', 'Sign-in did not complete. Try again.')));
        return;
      }
      poll = setTimeout(watch, 1500);
    } catch (error) {
      busy.value = false;
      failed(error);
    }
  }

  async function start() {
    if (poll) clearTimeout(poll);
    // Opened now, while the click still allows it; the address follows once the server has it.
    const opened = window.open('', '_blank');
    if (opened) opened.opener = null;
    busy.value = true;
    url.value = '';
    code.value = '';
    message.value = '';
    try {
      // A failed save has already said why.
      if (save && !(await save())) {
        opened?.close();
        busy.value = false;
        return;
      }
      const result = await copilotLoginStart(provider());
      url.value = result.verification_uri;
      code.value = result.user_code;
      if (opened) opened.location.href = result.verification_uri;
      message.value = tr('请在打开的 GitHub 页面输入下面的验证码并授权。', 'Enter the code below on the GitHub page and authorize.');
      poll = setTimeout(watch, 1500);
    } catch (error) {
      opened?.close();
      busy.value = false;
      failed(error);
    }
  }

  return { busy, url, code, message, start };
}
