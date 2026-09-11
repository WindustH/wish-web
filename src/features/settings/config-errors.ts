import { ApiError } from '../../core/api/client.js';
import { errorText, type ConfigErrorStage } from '../../core/config-editor';
import { tr } from './fields';

export function configFailure(error: unknown, stage: ConfigErrorStage | undefined) {
  const detail = error instanceof ApiError ? error.detail || error.message : errorText(error);
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
