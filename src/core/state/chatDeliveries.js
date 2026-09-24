// Sending and queued input reconciliation share one session-owned lifecycle.
import { shallowRef } from 'vue';
import * as api from '../api/endpoints.js';
import { uploadAttachments } from '../attachments.js';

export function createChatDeliveries({ sessionId, snapshot, stream, error, options, scheduleRefresh, requests = api, upload = uploadAttachments }) {
  const sending = shallowRef(false);
  const sentRun = shallowRef(null);
  const deliveries = shallowRef([]);

  let generation = 0;
  let deliveriesVersion = 0;
  let directSending = false;
  const directInputs = new Set();
  const current = own => own === generation;
  function reset() {
    generation++;
    deliveriesVersion++;
    directInputs.clear();
    directSending = false;
    sending.value = false;
    sentRun.value = null;
    deliveries.value = [];
  }
  async function send(text, attachments = []) {
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

  async function refreshDeliveries() {
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

  async function moveQueued(id, before) {
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

  async function cancelQueued(id) {
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
