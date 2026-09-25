// Sending and queued input reconciliation share one session-owned lifecycle.
import { shallowRef, type ShallowRef } from 'vue';
import * as api from '../api/endpoints.ts';
import type { EndpointOptions, MessageBlock, QueuedDelivery } from '../api/endpoints.ts';
import { uploadAttachments } from '../attachments.ts';

// The run a send() started: the session it went to and its delivery id.
export interface SentRun { sessionId: string; deliveryId: string }
export type DeliveryAttachment = Parameters<typeof uploadAttachments>[1][number];
export type DeliveryRequests = Pick<typeof api, 'messageSend' | 'deliveriesList' | 'moveQueuedInput' | 'cancelQueuedInput'>;

export interface ChatDeliveriesDeps {
  sessionId: ShallowRef<string | null>;
  snapshot: ShallowRef<{ phase?: string } | null>;
  stream: ShallowRef<{ active: boolean }>;
  error: ShallowRef<unknown>;
  options: () => EndpointOptions;
  scheduleRefresh: () => void;
  requests?: DeliveryRequests;
  upload?: (sessionId: string, attachments: DeliveryAttachment[], opts: EndpointOptions) => Promise<{ blocks: MessageBlock[] }>;
}

export function createChatDeliveries({ sessionId, snapshot, stream, error, options, scheduleRefresh, requests = api, upload = uploadAttachments }: ChatDeliveriesDeps) {
  const sending = shallowRef(false);
  const sentRun = shallowRef<SentRun | null>(null);
  const deliveries = shallowRef<QueuedDelivery[]>([]);

  let generation = 0;
  let deliveriesVersion = 0;
  let directSending = false;
  const directInputs = new Set<string>();
  const current = (own: number) => own === generation;
  function reset() {
    generation++;
    deliveriesVersion++;
    directInputs.clear();
    directSending = false;
    sending.value = false;
    sentRun.value = null;
    deliveries.value = [];
  }
  async function send(text: string, attachments: DeliveryAttachment[] = []): Promise<string | null> {
    const own = generation;
    const id = sessionId.value;
    if (!id || sending.value) return null;
    sending.value = true;

    const direct = !stream.value.active && snapshot.value?.phase === 'idle';
    directSending = direct;
    if (direct) deliveriesVersion++;

    try {
      const requestOptions = options();
      const { blocks } = await upload(id, attachments, requestOptions);
      if (!current(own)) return null;
      const result = await requests.messageSend(id, { content: text, blocks }, requestOptions);

      if (current(own)) {
        deliveriesVersion++;
        if (direct) directInputs.add(result.id);
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
    } catch (cause) {
      if (current(own)) error.value = cause;
      throw cause;
    } finally {
      if (current(own)) {
        sending.value = false;
        directSending = false;
        void refreshDeliveries();
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
        deliveries.value = page.items.filter((item) => !directInputs.has(item.id));
      }
    } catch (cause) {
      if (current(own)) error.value = cause;
    }
  }

  async function moveQueued(id: string, before: string | null): Promise<void> {
    const own = generation;
    const session = sessionId.value;
    if (!session) return;
    try {
      await requests.moveQueuedInput(session, id, before);
    } catch (cause) {
      if (current(own)) error.value = cause;
      throw cause;
    } finally {
      if (current(own)) await refreshDeliveries();
    }
  }

  async function cancelQueued(id: string): Promise<boolean> {
    const own = generation;
    const session = sessionId.value;
    if (!session) return false;
    try { await requests.cancelQueuedInput(session, id); }
    catch (cause) { if (current(own)) error.value = cause; throw cause; }
    if (current(own)) await refreshDeliveries();
    return true;
  }


  return { sending, sentRun, deliveries, send, refreshDeliveries, moveQueued, cancelQueued, reset };
}
