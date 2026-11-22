import { shallowRef } from 'vue';
import { ApiError, getConnectionScope } from '../api/client.ts';
import { messageSend, supportsInputRequestId } from '../api/endpoints.ts';
import { uploadAttachments, type AttachmentInput } from '../attachments.ts';
import { splitAttachmentText } from '../attachmentPlaceholders.ts';
import { expandPastedText } from '../pastedText.ts';
import type { ContentBlock } from '../api/userContent.ts';
import { requestId } from '../util/requestId.ts';

export interface MessageDraft {
  text: string;
  attachments: AttachmentInput[];
}

export interface PendingMessage {
  id: string;
  owner: string;
  queued: boolean;
  draft: MessageDraft;
  state: 'waiting' | 'uploading' | 'sending' | 'acked' | 'failed';
  entry?: number;
  error?: unknown;
  uncertain?: boolean;
  retryable?: boolean;
}

type Submission = {
  text: string;
  attachments: AttachmentInput[];
  metadata?: unknown;
};
type Job = Submission & {
  scope: string;
  controller: AbortController;
  body?: Parameters<typeof messageSend>[1];
};

function preview(item: AttachmentInput): AttachmentInput {
  const previewBlob =
    item.previewBlob ??
    (item.kind === 'image' && item.bytes.byteLength ? new Blob([item.bytes], { type: item.mime }) : undefined);
  return {
    ...item,
    previewBlob,
    localUrl: previewBlob ? URL.createObjectURL(previewBlob) : '',
  };
}
export const captureMessageDraft = (draft: MessageDraft): MessageDraft => ({
  text: draft.text,
  attachments: draft.attachments.map(preview),
});
export function releaseMessageDraft(draft: MessageDraft) {
  for (const attachment of draft.attachments) if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
}

export function pendingUserContent(owner: string, draft: MessageDraft): ContentBlock[] {
  const { text, attachments } = expandPastedText(draft.text, draft.attachments);
  const block = (item: AttachmentInput): ContentBlock =>
    item.reply
      ? { type: 'reply', reference: item.reply }
      : {
          type: item.kind,
          filename: item.name,
          byte_count: item.size ?? item.bytes.byteLength,
          ...(item.stored?.owner === owner ? { blob_id: `${owner}/${item.stored.id}` } : {}),
          ...(item.kind === 'image' && item.previewBlob ? { localPreview: item.previewBlob } : {}),
        };
  return [
    ...splitAttachmentText(text, attachments).map((part): ContentBlock =>
      part.type === 'text' ? { type: 'text', text: part.text } : block(part.attachment),
    ),
    ...attachments.filter((item) => !item.placeholder).map(block),
  ];
}

export function createPendingMessages({
  send = messageSend,
  supportsRequestId = supportsInputRequestId,
  upload = uploadAttachments,
  scope = getConnectionScope,
  accepted,
  settled,
}: {
  send?: typeof messageSend;
  supportsRequestId?: typeof supportsInputRequestId;
  upload?: typeof uploadAttachments;
  scope?: typeof getConnectionScope;
  accepted: (owner: string, receipt: Awaited<ReturnType<typeof messageSend>>) => void;
  settled?: (owner: string) => void;
}) {
  const messages = shallowRef<PendingMessage[]>([]);
  const jobs = new Map<string, Job>();
  const draining = new Set<string>();
  let server: { scope: string; supportsId: boolean; checkedAt: number } | undefined;
  const awaitingEcho = new Map<string, ReturnType<typeof setTimeout>>();

  function update(id: string, change: Partial<PendingMessage>) {
    messages.value = messages.value.map((item) => (item.id === id ? { ...item, ...change } : item));
  }
  function release(id: string) {
    const item = messages.value.find((value) => value.id === id);
    if (!item) return;
    clearTimeout(awaitingEcho.get(id));
    awaitingEcho.delete(id);
    releaseMessageDraft(item.draft);
    messages.value = messages.value.filter((value) => value.id !== id);
    jobs.delete(id);
  }
  function expirePreview(id: string) {
    awaitingEcho.set(
      id,
      setTimeout(() => release(id), 15_000),
    );
  }

  async function submit(item: PendingMessage, job: Job) {
    const options = { signal: job.controller.signal };
    if (scope() !== job.scope) throw new DOMException('Connection changed', 'AbortError');
    if (!job.body) {
      const supportsId =
        server?.scope === job.scope && Date.now() - server.checkedAt < (server.supportsId ? 300_000 : 10_000)
          ? server.supportsId
          : await supportsRequestId(options).catch(() => false);
      server = { scope: job.scope, supportsId, checkedAt: Date.now() };
      options.signal.throwIfAborted();
      if (scope() !== job.scope) throw new DOMException('Connection changed', 'AbortError');
      update(item.id, { state: job.attachments.length ? 'uploading' : 'sending' });
      const blocks = job.attachments.length ? (await upload(item.owner, job.attachments, options)).blocks : [];
      options.signal.throwIfAborted();
      if (scope() !== job.scope) throw new DOMException('Connection changed', 'AbortError');
      job.body = {
        content: job.text,
        blocks,
        ...(supportsId
          ? { request_id: item.id, metadata: job.metadata }
          : {
              metadata: { ...(job.metadata as Record<string, unknown> | undefined), wish_client_submission: item.id },
            }),
      };
    }
    update(item.id, { state: 'sending' });
    const receipt = await send(item.owner, job.body, options);
    if (job.body.request_id && receipt.request_id !== item.id)
      throw new Error('Input receipt did not match the submitted message');
    return receipt;
  }

  async function drain(owner: string) {
    if (draining.has(owner)) return;
    draining.add(owner);
    try {
      while (true) {
        const item = messages.value.find((value) => value.owner === owner && value.state === 'waiting');
        if (!item) return;
        const job = jobs.get(item.id)!;
        let receipt: Awaited<ReturnType<typeof send>>;
        try {
          receipt = await submit(item, job);
        } catch (error) {
          if (!jobs.has(item.id)) continue;
          const rejected =
            error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408;
          const uncertain = Boolean(item.uncertain || (job.body && !rejected));
          if (rejected && !uncertain) job.body = undefined;
          const retryable = scope() === job.scope && (!uncertain || !!job.body?.request_id);
          update(item.id, { state: 'failed', error, uncertain, retryable });
          settled?.(owner);
          continue;
        }
        if (!jobs.has(item.id)) continue;
        update(item.id, { state: 'acked', entry: receipt.entry, uncertain: false });
        expirePreview(item.id);
        accepted(owner, receipt);
      }
    } finally {
      draining.delete(owner);
    }
  }
  function enqueue(owner: string, submission: Submission, draft: MessageDraft, queued: boolean) {
    const id = requestId();
    const retained = captureMessageDraft(draft);
    const controller = new AbortController();
    jobs.set(id, { ...submission, scope: scope(), controller });
    messages.value = [...messages.value, { id, owner, queued, draft: retained, state: 'waiting' }];
    void drain(owner);
    return id;
  }
  function acceptInitial(owner: string, draft: MessageDraft, entry: number) {
    const id = owner;
    messages.value = [
      ...messages.value,
      { id, owner, queued: false, draft: captureMessageDraft(draft), state: 'acked', entry },
    ];
    expirePreview(id);
  }
  function retry(id: string, queued: boolean): boolean {
    const item = messages.value.find((value) => value.id === id);
    const job = jobs.get(id);
    if (!item?.retryable || item.state !== 'failed' || !job || job.scope !== scope()) return false;
    job.controller = new AbortController();
    update(id, { state: 'waiting', queued, error: undefined, retryable: false });
    void drain(item.owner);
    return true;
  }
  function discard(id: string): MessageDraft | undefined {
    const item = messages.value.find((value) => value.id === id);
    if (item?.state !== 'failed') return;
    release(id);
    void drain(item.owner);
    return item.draft;
  }
  function reconcile(owner: string, entries: ReadonlySet<string>, requests: ReadonlySet<string>) {
    for (const item of messages.value) {
      if (item.owner !== owner) continue;
      if (item.entry !== undefined && entries.has(String(item.entry))) release(item.id);
      else if (requests.has(item.id)) {
        jobs.get(item.id)?.controller.abort();
        release(item.id);
        void drain(owner);
      }
    }
  }
  function forget(owner: string) {
    for (const item of messages.value) {
      if (item.owner !== owner) continue;
      jobs.get(item.id)?.controller.abort();
      release(item.id);
    }
  }
  return { messages, enqueue, acceptInitial, retry, discard, reconcile, forget };
}
