import { i18n } from '../../core/i18n/index.js';
export const tr = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;

export const compactionFields = () => [
  {key:'trigger_tokens',label:tr('触发压缩的 Token 数','Compaction trigger tokens')},
  {key:'target_tokens',label:tr('压缩后的目标 Token 数','Target tokens after compaction')},
  {key:'segment_tokens',label:tr('触发分段摘要的 Token 阈值','Segment summary token threshold')},
];
