// Runs inside the device browser guest.
function wishPageAction(args) {
  const heading = { title: document.title.slice(0, 250), url: location.origin + location.pathname };
  switch (args.action) {
    case 'pageState':
      return {
        ...heading,
        url: location.href,
        documentId: performance.timeOrigin,
        loaded: ['http:', 'https:'].includes(location.protocol) && document.readyState !== 'loading',
      };
    case 'observe': {
      const refs = new Map();
      const prefix = Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');
      const elements = [];
      for (const el of document.querySelectorAll(
        'a[href],button,input:not([type=hidden]),select,textarea,[contenteditable]:not([contenteditable=false]),[role=button],[role=link]',
      )) {
        const r = el.getBoundingClientRect();
        if (
          !r.width ||
          !r.height ||
          r.bottom <= 0 ||
          r.top >= innerHeight ||
          getComputedStyle(el).visibility === 'hidden'
        )
          continue;
        const ref = prefix + '-' + elements.length;
        refs.set(ref, el);
        const name =
          el.getAttribute('aria-label') ||
          el.labels?.[0]?.innerText ||
          el.innerText ||
          el.title ||
          el.placeholder ||
          '';
        elements.push({
          ref,
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          name: name.trim().slice(0, 90),
        });
        if (elements.length === 64) break;
      }
      globalThis.__wishClientRefs = refs;
      return { ...heading, text: (document.body?.innerText || '').slice(0, 1200), elements };
    }
    case 'read': {
      const text = document.body?.innerText || '';
      const offset = Math.max(0, Number(args.offset) || 0);
      return {
        ...heading,
        text: text.slice(offset, offset + 4000),
        next_offset: offset + 4000 < text.length ? offset + 4000 : null,
      };
    }
    case 'back':
      history.back();
      break;
    case 'scroll':
      scrollBy(Number(args.dx) || 0, Number(args.dy) || 0);
      break;
    case 'click':
    case 'fill':
    case 'select': {
      const el = globalThis.__wishClientRefs?.get(args.ref);
      if (!el?.isConnected) throw Error('stale_ref: observe this page again');
      if (el.matches(':disabled,[aria-disabled=true]')) throw Error('Element is disabled');
      if (args.action === 'click') {
        el.click();
        break;
      }
      if (args.action === 'select') {
        if (!(el instanceof HTMLSelectElement) || !Array.from(el.options).some((o) => o.value === args.value))
          throw Error('Unknown option');
        el.value = args.value;
      } else {
        if (typeof args.text !== 'string' || el.readOnly) throw Error('Field is not editable');
        el.focus();
        if (el.isContentEditable) el.textContent = args.text;
        else if (
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLInputElement && !['file', 'button', 'submit', 'checkbox', 'radio'].includes(el.type))
        ) {
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, args.text);
        } else throw Error('Field is not editable');
      }
      for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
      break;
    }
    default:
      throw Error('Unsupported client browser action');
  }
  return { dispatched: true };
}
