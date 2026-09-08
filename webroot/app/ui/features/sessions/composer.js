// Desktop: full-width rectangle, user-resized height, internal text scrolling.
// Mobile: compact input row that grows from one line with its content.
//
// Correctness rules (task 1 + review round 1):
//  · IME-safe Enter — composition strokes never send (isComposing / 229);
//  · in-flight guard — double-click cannot double-send (chat.sending);
//  · the input is NOT cleared while the send is in flight — on success only
//    the exact sent payload is cleared (if the user typed more meanwhile,
//    those edits survive); on failure everything stays (review #6);
//  · Enter never interrupts a running turn — stop must be an explicit
//    button action (review #7);
//  · drafts are per-session (explicit id) and restored when switching back;
//  · object URLs are revoked on remove / successful send / switch / unmount.
import { html } from '../../h.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { cfg } from '../../../core/config.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { prefs } from '../../../core/state/prefsSlice.js';
import { platform } from '../../../platform/index.js';
import { Icon } from '../../components/icon.js';
import { toast } from '../../components/toast.js';
import { ComposerResizeHandle, useComposerHeight } from './resize.js';

const revokeAll = (imgs) => { for (const i of imgs) if (i?.localUrl) URL.revokeObjectURL(i.localUrl); };

export function Composer({ sessionId, mobile, onSearch }) {
  const stream = useSignal(chat.stream);
  const sending = useSignal(chat.sending);
  const caps = useSignal(chat.capabilities);
  const sendOnEnter = useSignal(prefs.sendOnEnter);
  const [text, setText] = useState(() => chat.getDraft(sessionId));
  const [images, setImages] = useState([]);   // {name,mime,bytes,localUrl}
  const taRef = useRef(null);
  const composerRef = useRef(null);
  const sizing = useComposerHeight(composerRef, mobile);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const textRef = useRef(text);
  textRef.current = text;
  const running = stream?.active;

  const sidRef = useRef(sessionId);
  sidRef.current = sessionId;
  const textOwner = useRef(sessionId);   // session the CURRENT text belongs to
  // Draft ownership is explicit: this component's session id, never
  // chat.sessionId (which may already point at the NEXT session). Text
  // captured under session A must never be written into session B's draft
  // during a switch render (review round-2).
  const setTextOwned = (v) => {
    textOwner.current = sidRef.current;
    setText(v);
    chat.setDraft(v, sidRef.current);   // persisted at the input event itself
  };

  // Session switch: restore THAT session's draft, drop attachments.
  // (Old code always cleared to '' — drafts were saved but never restored,
  // and a stale non-empty text could leak into the next session's draft.)
  useEffect(() => {
    setTextOwned(chat.getDraft(sessionId));   // restored text belongs to THIS session
    setImages((prev) => { revokeAll(prev); return []; });
    return () => revokeAll(imagesRef.current);   // unmount / next switch
  }, [sessionId]);

  // Desktop never grows when typing. Only the mobile textarea sizes itself.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!mobile) { ta.style.height = ''; ta.style.overflowY = 'auto'; return; }
    ta.style.height = 'auto';
    const lineH = parseFloat(getComputedStyle(ta).lineHeight);
    const padding = parseFloat(getComputedStyle(ta).paddingTop) + parseFloat(getComputedStyle(ta).paddingBottom);
    const maxPx = Math.min(lineH * cfg.composer.mobileMaxRows + padding, window.innerHeight * cfg.composer.mobileMaxHeightVh);
    ta.style.height = Math.min(ta.scrollHeight, maxPx) + 'px';
    ta.style.overflowY = ta.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [text, mobile]);


  const busy = running || sending;
  const canSend = (text.trim().length > 0 || images.length > 0) && !busy;

  // Capability gating (contract #4). caps is tri-state:
  //  · {status:'ok', data} — gate on data.input_modalities;
  //  · null (loading) or {status:'error'} (API failure) — permissive defaults,
  //    the server validates on send (an API failure is NOT "unsupported");
  //  · data.input_modalities === null — genuinely unknown → permissive.
  // Only an explicit modality list without "image" disables image input.
  const capsFailed = caps?.status === 'error';
  const capsData = caps?.status === 'ok' ? caps.data : null;
  const imageAllowed = !capsData
    || capsData.input_modalities == null
    || (Array.isArray(capsData.input_modalities) && capsData.input_modalities.includes('image'));
  const maxImages = capsData?.images?.max_images_per_message ?? cfg.composer.maxImages;
  const maxImageBytes = capsData?.images?.max_image_bytes ?? cfg.composer.maxImageBytes;
  const allowedMimes = Array.isArray(capsData?.images?.allowed_mime_types) && capsData.images.allowed_mime_types.length
    ? capsData.images.allowed_mime_types : null;

  async function attach() {
    if (!imageAllowed) { toast(i18n.t('chat.imageUnsupported')); return; }
    const owner = sessionId;
    const fs = platform('fs');
    const picked = await fs.pickImages({ multiple: true });
    if (sidRef.current !== owner) return;   // switched away while picking
    setImages((cur) => {                    // functional: never resurrect removed attachments
      const next = [...cur];
      for (const p of picked) {
        if (allowedMimes && !allowedMimes.includes(p.mime)) { toast(i18n.t('chat.imageMime')); continue; }
        if (p.bytes.byteLength > maxImageBytes) { toast(i18n.t('chat.imageTooLarge')); continue; }
        if (next.length >= maxImages) break;
        next.push({ ...p, localUrl: URL.createObjectURL(new Blob([p.bytes], { type: p.mime })) });
      }
      return next;
    });
  }

  function removeImage(i) {
    const img = images[i];
    if (img?.localUrl) URL.revokeObjectURL(img.localUrl);
    setImages(images.filter((_, j) => j !== i));
  }

  async function submit() {
    if (sending || running) return;            // in-flight guard; no implicit stop
    if (!canSend) return;
    const owner = sessionId;
    const payload = text, imgs = images;
    try {
      const receipt = await chat.send(payload, imgs);
      if (!receipt) return;   // stale (session switched): never accepted —
                              // draft/attachments must survive untouched
      // Accepted. If the user switched sessions mid-flight, settle the OLD
      // session's draft explicitly and never touch the new one (review r2).
      if (sidRef.current !== owner) {
        chat.setDraft('', owner);
        revokeAll(imgs);
        return;
      }
      // Success: clear only what was sent, via FUNCTIONAL updates — reading
      // the closed-over `images` array would discard attachments added
      // during the in-flight send (review round-2). The draft is cleared
      // ONLY if the text is still the sent payload (newer edits keep theirs,
      // already saved per-keystroke by the [text] effect).
      if (textRef.current === payload) {
        setText('');
        chat.setDraft('', owner);
      }
      setImages((cur) => cur.filter((i) => !imgs.includes(i)));
      revokeAll(imgs);
    } catch (e) {
      if (sidRef.current === owner) toast(String(e?.detail || e?.message || e));
      // Draft and attachments stay exactly as they are.
    }
  }

  function onStop() { if (running && !sending) chat.interrupt(); }

  function onKeyDown(e) {
    // IME composition: Enter confirms the candidate window — never sends.
    if (e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229) return;
    if (mobile) return; // The phone keyboard inserts a newline; tap Send to send.
    const enterSends = sendOnEnter;
    if (e.key === 'Enter') {
      const plainEnter = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
      const modEnter = e.ctrlKey || e.metaKey;
      if ((enterSends && plainEnter) || (!enterSends && modEnter)) {
        if (!running && !sending) {            // keyboard never interrupts
          e.preventDefault();
          submit();
        }
      }
    }
  }

  const sendButton = html`<button class="send-btn ${running ? 'stop' : ''}" onClick=${running ? onStop : submit}
    disabled=${sending || (!running && !canSend)}
    aria-label=${running ? i18n.t('chat.stop') : i18n.t('chat.send')}
    title=${running ? i18n.t('chat.stop') : i18n.t('chat.send')}>
    ${sending && html`<${Icon} name="loader-circle" class="spin" />`}
    ${i18n.t(running ? 'chat.stop' : 'chat.send')}
  </button>`;
  const imageButton = html`<button class="btn ghost icon-only" title=${i18n.t('chat.image')} aria-label=${i18n.t('chat.image')}
    disabled=${!imageAllowed} onClick=${attach}><${Icon} name="image" /></button>`;

  return html`<div ref=${composerRef} class="composer ${mobile ? 'mobile' : 'desktop'}"
    style=${mobile ? undefined : { height: `${sizing.height}px` }}>
    ${!mobile && html`<${ComposerResizeHandle} ...${sizing} />`}
    ${!mobile && html`<div class="composer-toolbar">
      ${imageButton}
      <div class="grow" />
      <button class="btn ghost icon-only" title=${i18n.t('chatbar.search')} aria-label=${i18n.t('chatbar.search')}
        onClick=${onSearch}><${Icon} name="history" /></button>
    </div>`}
    ${images.length > 0 && html`<div class="attach-strip">
      ${images.map((img, i) => html`<div class="attach-thumb" key=${i}>
        <img src=${img.localUrl} alt=${img.name} />
        <button class="rm" aria-label=${i18n.t('common.remove')} onClick=${() => removeImage(i)}>
          <${Icon} name="x" class="sm" />
        </button>
      </div>`)}
    </div>`}
    ${capsFailed && html`<div class="caps-error">
      <span>${i18n.t('chat.capError')}</span>
      <button class="btn ghost sm" onClick=${() => chat.reloadCapabilities()}>${i18n.t('common.retry')}</button>
    </div>`}
    <div class="composer-editor">
      ${mobile && imageButton}
      <textarea ref=${taRef} rows=${cfg.composer.mobileMinRows}
        placeholder=${running ? i18n.t('chat.placeholderRunning') : i18n.t('chat.placeholder')}
        value=${text} onInput=${(e) => setTextOwned(e.target.value)} onKeyDown=${onKeyDown}
        aria-label=${i18n.t('chat.placeholder')} />
      ${mobile && sendButton}
    </div>
    ${!mobile && html`<div class="composer-footer">
      <span class="composer-hint">${i18n.t(sendOnEnter ? 'composer.enterSends' : 'composer.modEnterSends')}</span>
      ${sendButton}
    </div>`}
  </div>`;
}
