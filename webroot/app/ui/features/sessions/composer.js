// Composer: mobile = single-line start, image left + send right; desktop =
// large initial area, image top-left + send bottom-right. Grows with
// content up to a cap, then scrolls. Send button morphs send↔stop
// (morphicons element) while a run is active.
//
// Correctness rules (task 1):
//  · IME-safe Enter — composition strokes never send (isComposing / 229);
//  · in-flight guard — double-click cannot double-send (chat.sending);
//  · failures keep the draft AND every attachment (chat.send throws);
//  · drafts are per-session and restored when switching back;
//  · object URLs are revoked on remove / successful send / switch / unmount.
import { html } from '../../h.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { cfg } from '../../../core/config.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { prefs } from '../../../core/state/prefsSlice.js';
import { platform } from '../../../platform/index.js';
import { Icon } from '../../components/icon.js';
import { toast } from '../../components/toast.js';
import { ensureMorphicons } from './morph.js';

const revokeAll = (imgs) => { for (const i of imgs) if (i?.localUrl) URL.revokeObjectURL(i.localUrl); };

export function Composer({ sessionId, mobile }) {
  const stream = useSignal(chat.stream);
  const sending = useSignal(chat.sending);
  const sendOnEnter = useSignal(prefs.sendOnEnter);
  const [text, setText] = useState(() => chat.getDraft(sessionId));
  const [images, setImages] = useState([]);   // {name,mime,bytes,localUrl}
  const taRef = useRef(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const running = stream?.active;

  useEffect(() => { chat.setDraft(text); }, [text]);

  // Session switch: restore THAT session's draft, drop attachments.
  // (Old code always cleared to '' — drafts were saved but never restored,
  // and a stale non-empty text could leak into the next session's draft.)
  useEffect(() => {
    setText(chat.getDraft(sessionId));
    setImages((prev) => { revokeAll(prev); return []; });
    return () => revokeAll(imagesRef.current);   // unmount / next switch
  }, [sessionId]);

  // auto-grow: cap by rows, then by viewport fraction, then scroll
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxRows = mobile ? cfg.composer.mobileMaxRows : cfg.composer.desktopMaxRows;
    const lineH = parseFloat(getComputedStyle(ta).lineHeight) || 23;
    const maxPx = Math.min(lineH * maxRows, window.innerHeight * cfg.composer.maxHeightVh);
    ta.style.height = Math.min(ta.scrollHeight, maxPx) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [text, mobile]);

  useEffect(() => { ensureMorphicons(); }, []);

  const busy = running || sending;
  const canSend = (text.trim().length > 0 || images.length > 0) && !busy;

  async function attach() {
    const fs = platform('fs');
    const picked = await fs.pickImages({ multiple: true });
    const next = [...images];
    for (const p of picked) {
      if (p.bytes.byteLength > cfg.composer.maxImageBytes) { toast(i18n.t('chat.imageTooLarge')); continue; }
      if (next.length >= cfg.composer.maxImages) break;
      next.push({ ...p, localUrl: URL.createObjectURL(new Blob([p.bytes], { type: p.mime })) });
    }
    setImages(next);
  }

  function removeImage(i) {
    const img = images[i];
    if (img?.localUrl) URL.revokeObjectURL(img.localUrl);
    setImages(images.filter((_, j) => j !== i));
  }

  async function submit() {
    if (sending) return;                       // in-flight guard
    if (!canSend) {
      if (running) chat.interrupt();           // stop button role
      return;
    }
    const payload = text, imgs = images;
    setText(''); setImages([]);
    try {
      await chat.send(payload, imgs);
      revokeAll(imgs);                         // sent: thumbnails no longer needed
    } catch (e) {
      toast(String(e?.detail || e?.message || e));
      setText(payload); setImages(imgs);       // keep draft AND attachments
    }
  }

  function onKeyDown(e) {
    // IME composition: Enter confirms the candidate window — never sends.
    if (e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229) return;
    const enterSends = sendOnEnter;
    if (e.key === 'Enter') {
      const plainEnter = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
      const modEnter = e.ctrlKey || e.metaKey;
      if ((enterSends && plainEnter) || (!enterSends && modEnter)) {
        e.preventDefault();
        submit();
      }
    }
  }

  return html`<div class="composer ${mobile ? 'mobile' : 'desktop'}">
    <div class="composer-inner">
      <div class="composer-box">
        ${images.length > 0 && html`<div class="attach-strip">
          ${images.map((img, i) => html`<div class="attach-thumb" key=${i}>
            <img src=${img.localUrl} alt=${img.name} />
            <button class="rm" aria-label=${i18n.t('common.remove')} onClick=${() => removeImage(i)}>
              <${Icon} name="x" class="sm" />
            </button>
          </div>`)}
        </div>`}
        ${!mobile && html`<div class="row">
          <button class="btn ghost icon-only" title=${i18n.t('chat.image')} aria-label=${i18n.t('chat.image')}
            onClick=${attach}><${Icon} name="image" /></button>
          <div class="grow" />
        </div>`}
        <textarea ref=${taRef} rows=${mobile ? cfg.composer.mobileMinRows : cfg.composer.desktopMinRows}
          placeholder=${running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')}
          value=${text}
          onInput=${(e) => setText(e.target.value)}
          onKeyDown=${onKeyDown}
          aria-label=${i18n.t('chat.placeholder')} />
        <div class="row">
          ${mobile && html`<button class="btn ghost icon-only" title=${i18n.t('chat.image')}
            aria-label=${i18n.t('chat.image')} onClick=${attach}><${Icon} name="image" /></button>`}
          <div class="grow" />
          <button class="send-btn ${running ? 'stop' : ''}" onClick=${submit}
            disabled=${sending || (!running && !canSend)}
            aria-label=${running ? i18n.t('chat.stop') : i18n.t('chat.send')}
            title=${running ? i18n.t('chat.stop') : i18n.t('chat.send')}>
            ${(running || sending)
              ? html`<${Icon} name=${sending ? 'loader-circle' : 'square'} class=${sending ? 'spin' : ''} />`
              : html`<${Icon} name="send" />`}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}
