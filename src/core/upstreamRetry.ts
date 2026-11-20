import { tr } from './i18n/tr.ts';
import { displayFailure, type DisplayFailure } from './api/failures.ts';

export interface UpstreamRetry {
  requestId: string;
  operation: string;
  phase: 'waiting' | 'attempting';
  retry: number;
  maxRetries: number;
  retryAt: number;
  failure: DisplayFailure | null;
}

/** Translate server wall time into a local deadline, including snapshots after reconnect. */
export function readUpstreamRetry(value: any, serverTime = value?.observed_at, now = Date.now()): UpstreamRetry | null {
  if (!value?.request_id || !['waiting', 'attempting'].includes(value.phase)) return null;
  if (
    !Number.isInteger(value.retry) ||
    !Number.isInteger(value.max_retries) ||
    value.retry < 1 ||
    value.retry > value.max_retries
  )
    return null;
  return {
    requestId: String(value.request_id),
    operation: String(value.operation),
    phase: value.phase,
    retry: value.retry,
    maxRetries: value.max_retries,
    retryAt: now + Math.max(0, (Number(value.retry_at) || 0) - (Number(serverTime) || 0)),
    failure: displayFailure(value.error),
  };
}

export function retrySecondsLeft(retry: UpstreamRetry, now = Date.now()): number {
  return Math.max(0, Math.ceil((retry.retryAt - now) / 1_000));
}

export const retryOperationName = (operation: string) =>
  ({
    model: tr('模型请求', 'Model request'),
    compaction: tr('上下文压缩', 'Context compaction'),
    token_count: tr('Token 计数', 'Token count'),
    model_list: tr('模型列表', 'Model list'),
    account_state: tr('账户查询', 'Account query'),
    web_search: tr('网页搜索', 'Web search'),
    web_fetch: tr('网页读取', 'Web fetch'),
  })[operation] ?? tr('上游请求', 'Upstream request');
