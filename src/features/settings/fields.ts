import { tr } from '../../core/i18n/tr';
export { tr } from '../../core/i18n/tr';

export const compactionFields = () => [
  {key:'trigger_tokens',label:tr('触发压缩的 Token 数','Compaction trigger tokens'),hint:tr('输入达到这个大小时开始压缩','Compaction starts when input reaches this size')},
  {key:'target_tokens',label:tr('压缩后的目标 Token 数','Target tokens after compaction'),hint:tr('压缩后输入回落到的大小','Input size after compaction')},
  {key:'segment_tokens',label:tr('触发分段摘要的 Token 阈值','Segment summary token threshold'),hint:tr('提前在后台摘要的每段内容大小','Size of each span summarized ahead of time')},
];
