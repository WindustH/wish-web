// Sending and queued input reconciliation share one session-owned lifecycle.
import { shallowRef, type ShallowRef } from 'vue';
import * as api from '../api/endpoints.ts';
import { ApiError } from '../api/client.ts';
import type { EndpointOptions, MessageBlock, QueuedDelivery } from '../api/endpoints.ts';
import { uploadAttachments } from '../attachments.ts';
import { sessionNaming } from './sessionNaming.ts';

// The run a send() started: the session it went to and its delivery id.
export interface SentRun {
  sessionId: string;
  deliveryId: string;
}
export type DeliveryAttachment = Parameters<typeof uploadAttachments>[1][number];
export type DeliveryRequests = Pick<
  typeof api,
  'messageSend' | 'deliveriesList' | 'moveQueuedInput' | 'cancelQueuedInput'
>;

export interface ChatDeliveriesDeps {
  sessionId: ShallowRef<string | null>;
  snapshot: ShallowRef<{ phase?: string } | null>;
  stream: ShallowRef<{ active: boolean }>;
  options: () => EndpointOptions;
  scheduleRefresh: () => void;
  requests?: DeliveryRequests;
  nameFirstMessage?: (id: string, entry: number) => Promise<void>;
  upload?: (
    sessionId: string,
    attachments: DeliveryAttachment[],
    opts: EndpointOptions,
  ) => Promise<{ blocks: MessageBlock[] }>;
}

export function createChatDeliveries({
  sessionId,
  snapshot,
  stream,
  options,
  scheduleRefresh,
  requests = api,
  upload = uploadAttachments,
  nameFirstMessage = sessionNaming.generate,
}: ChatDeliveriesDeps) {
  const sending = shallowRef(false);
  const sentRun = shallowRef<SentRun | null>(null);
  const deliveries = shallowRef<QueuedDelivery[]>([]);

  let generation = 0;
  let deliveriesVersion = 0;
  let directSending = false;
  const cancelling = new Set<string>();
  const current = (own: number) => own === generation;
  function reset() {
    generation++;
    deliveriesVersion++;
    cancelling.clear();
    directSending = false;
    sending.value = false;
    sentRun.value = null;
    deliveries.value = [];
  }
  async function send(
    text: string,
    attachments: DeliveryAttachment[] = [],
    metadata?: unknown,
  ): Promise<string | null> {
    const own = generation;
    const id = sessionId.value;
    if (!id || sending.value) return null;
    sending.value = true;

    const direct = !stream.value.active && ['idle', 'suspended'].includes(snapshot.value?.phase ?? '');
    directSending = direct;
    if (direct) deliveriesVersion++;

    try {
      const requestOptions = options();
      const { blocks } = await upload(id, attachments, requestOptions);
      if (!current(own)) return null;
      const result = await requests.messageSend(
        id,
        { content: text, blocks, ...(metadata ? { metadata } : {}) },
        requestOptions,
      );

      if (result.first_user_message) void nameFirstMessage(id, result.entry);

      if (current(own)) {
        deliveriesVersion++;
        if (!direct && stream.value.active && !deliveries.value.some((item) => item.id === result.id)) {
          deliveries.value = [
            ...deliveries.value,
            {
              id: result.id,
              state: 'queued',
              text,
              attachments: blocks.map((b) => ({
                kind: b.type,
                blob_id: `${id}/${b.blob_id}`,
                filename: b.filename,
                placeholder: b.placeholder,
              })),
            },
          ];
        }
        sentRun.value = { sessionId: id, deliveryId: result.id };
        scheduleRefresh();
      }
      return result.id;
    } finally {
      if (current(own)) {
        sending.value = false;
        directSending = false;
        void refreshDeliveries().catch(scheduleRefresh);
      }
    }
  }

  async function refreshDeliveries(): Promise<void> {
    const own = generation;
    const version = ++deliveriesVersion;
    const id = sessionId.value;
    if (!id) return;

    try {
      const page = await requests.deliveriesList(id, { limit: 50 }, options());
      if (current(own) && version === deliveriesVersion && !directSending) {
        deliveries.value = page.items.filter((item) => !cancelling.has(item.id));
      }
    } catch (cause) {
      if (current(own) && version === deliveriesVersion) throw cause;
    }
  }

  async function moveQueued(id: string, before: string | null): Promise<void> {
    const own = generation;
    const session = sessionId.value;
    if (!session) return;
    try {
      await requests.moveQueuedInput(session, id, before);
    } finally {
      if (current(own)) await refreshDeliveries().catch(scheduleRefresh);
    }
  }

  async function cancelQueued(id: string, { optimistic = false } = {}): Promise<boolean> {
    const own = generation;
    const session = sessionId.value;
    if (!session || cancelling.has(id)) return false;
    const index = deliveries.value.findIndex((item) => item.id === id);
    const item = deliveries.value[index];
    if (optimistic) {
      cancelling.add(id);
      deliveries.value = deliveries.value.filter((item) => item.id !== id);
    }
    let removed = false;
    try {
      await requests.cancelQueuedInput(session, id);
      removed = true;
      return current(own);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        removed = true;
        return false;
      }
      throw cause;
    } finally {
      if (current(own)) {
        cancelling.delete(id);
        deliveriesVersion++;
        if (removed) deliveries.value = deliveries.value.filter((item) => item.id !== id);
        else if (optimistic && item && !deliveries.value.some((item) => item.id === id)) {
          const restored = [...deliveries.value];
          restored.splice(index, 0, item);
          deliveries.value = restored;
        }
      }
    }
  }

  return { sending, sentRun, deliveries, send, refreshDeliveries, moveQueued, cancelQueued, reset };
}
