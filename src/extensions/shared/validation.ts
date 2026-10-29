import type { MediaJob, MediaArtifact } from '../../core/mediaGeneration.ts';
export const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
export function imageArtifact(value: unknown): boolean {
  const item = record(value);
  return (
    !!item &&
    typeof item.id === 'string' &&
    /^[a-f0-9]{64}$/.test(item.id) &&
    typeof item.mime_type === 'string' &&
    typeof item.path === 'string'
  );
}
export function mediaArtifact(value: unknown): value is MediaArtifact {
  const item = record(value);
  return (
    imageArtifact(value) &&
    typeof item?.byte_count === 'number' &&
    Number.isSafeInteger(item.byte_count) &&
    item.byte_count >= 0
  );
}
export function mediaJob(value: unknown): value is MediaJob {
  const job = record(value);
  return (
    !!job &&
    typeof job.job_id === 'string' &&
    job.job_id.length > 0 &&
    typeof job.kind === 'string' &&
    ['video', 'speech', 'music', 'sound_effect'].includes(job.kind) &&
    typeof job.status === 'string' &&
    ['submitting', 'running', 'downloading', 'succeeded', 'failed', 'outcome_unknown'].includes(job.status) &&
    typeof job.provider === 'string' &&
    typeof job.model === 'string' &&
    (job.error == null || typeof job.error === 'string') &&
    (job.timestamps == null || mediaArtifact(job.timestamps)) &&
    Array.isArray(job.artifacts) &&
    job.artifacts.every(mediaArtifact)
  );
}
