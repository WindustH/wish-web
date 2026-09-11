import { ApiError } from '../../core/api/client.js';
import { errorText, type ConfigErrorStage } from '../../core/config-editor';
import { tr } from './fields';

export function configFailure(error: unknown, stage: ConfigErrorStage | undefined) {
  let detail = error instanceof ApiError ? error.detail || error.message : errorText(error);
  const provider = detail.match(/provider `([^`]*)` must set exactly one of `preset` or `endpoint`/);
  if (provider) {
    const name = provider[1] ? `“${provider[1]}”` : tr('未命名的提供商', 'The unnamed provider');
    detail = tr(`${name}必须选择一个提供商预设或服务端点，不能同时设置。`, `${name} must select either a provider preset or a service endpoint, not both.`);
  }
  const rejected = stage === 'preview' || (error instanceof ApiError && error.status >= 400 && error.status < 500);
  const title = stage === 'load' ? tr('无法读取配置', 'Could not load configuration')
    : stage === 'restart' ? tr('配置已保存，重启未完成', 'Configuration saved; restart incomplete')
    : rejected ? tr('配置未保存', 'Configuration not saved')
    : tr('无法确认配置是否保存', 'Could not confirm whether configuration was saved');
  const hint = rejected
    ? tr('当前输入仍保留在编辑表单中，尚未写入配置文件。', 'Your input remains in the form and has not been written to the configuration file.')
    : tr('当前输入仍保留在编辑表单中。', 'Your input remains in the editing form.');
  return { title, detail, hint };
}
