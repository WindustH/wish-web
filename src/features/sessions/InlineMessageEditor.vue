<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useAttachmentTokenDrag } from './useAttachmentTokenDrag.ts';
import { splitAttachmentText } from '../../core/attachmentPlaceholders.ts';
import type { AttachmentInput } from '../../core/attachments.ts';
const props = defineProps<{ text: string; attachments: AttachmentInput[]; placeholder: string; label: string; scope: string }>();
const emit = defineEmits<{ 'update:text': [text: string]; keydown: [event: KeyboardEvent]; paste: [event: ClipboardEvent] }>();
const el = ref<HTMLDivElement | null>(null);
const composing = ref(false);
let value = props.text;
type Selection = { start: number; end: number };
let lastSelection: Selection = { start: value.length, end: value.length };
let history = [value], historyIndex = 0;
const bookmarks = new Set<Selection>();
function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && node.dataset.attachmentToken) return node.dataset.attachmentToken;
  if (node instanceof HTMLElement && node.hasAttribute('data-editor-tail')) return '';
  if (node.nodeName === 'BR') return '\n';
  return Array.from(node.childNodes).map(serialize).join('');
}
function position(node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(el.value!);
  range.setEnd(node, offset);
  return serialize(range.cloneContents()).length;
}
function selection(): Selection {
  const s = window.getSelection();
  if (!s?.rangeCount || !el.value?.contains(s.anchorNode) || !el.value.contains(s.focusNode)) return lastSelection;
  const r = s.getRangeAt(0);
  lastSelection = { start: position(r.startContainer, r.startOffset), end: position(r.endContainer, r.endOffset) };
  return { ...lastSelection };
}
function point(offset: number): [Node, number] {
  const root = el.value!;
  let remaining = offset;
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i]!;
    const length = serialize(node).length;
    if (remaining <= length) {
      if (node.nodeType === Node.TEXT_NODE) return [node, remaining];
      return [root, i + (remaining > 0 ? 1 : 0)];
    }
    remaining -= length;
  }
  return [root, root.childNodes.length];
}
function setSelection(start: number, end = start) {
  if (!el.value) return;
  const range = document.createRange();
  range.setStart(...point(start)); range.setEnd(...point(end));
  const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range);
  lastSelection = { start, end };
}
function render(text: string, restore?: Selection) {
  if (!el.value) return;
  const fragment = document.createDocumentFragment();
  for (const part of splitAttachmentText(text, props.attachments)) {
    if (part.type === 'text') fragment.append(document.createTextNode(part.text));
    else {
      const isImage = part.attachment!.kind === 'image';
      const label = isImage
        ? `Image ${props.attachments.filter(a => a.kind === 'image').indexOf(part.attachment!) + 1}`
        : part.attachment!.name || 'File';
      const chip = document.createElement('span');
      chip.contentEditable = 'false'; chip.draggable = false; chip.dataset.attachmentToken = part.text;
      chip.className = 'inline-attachment-token';
      if (part.attachment?.pastedText) chip.classList.add('pasted-text-token');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2'); icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round'); icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'width:1em;height:1em;vertical-align:-.15em;margin-right:5px;pointer-events:none';
      const shapes: [string, Record<string, string>][] = isImage ? [
        ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }],
        ['circle', { cx: '9', cy: '9', r: '2' }],
        ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
      ] : part.attachment?.pastedText ? [
        ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1', ry: '1' }],
        ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
      ] : [
        ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }],
        ['path', { d: 'M14 2v6h6' }],
      ];
      for (const [tag, attributes] of shapes) {
        const shape = document.createElementNS(icon.namespaceURI, tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        icon.append(shape);
      }
      chip.append(icon, document.createTextNode(label));
      chip.dataset.hint = part.attachment?.name || label;
      chip.setAttribute('aria-label', label);
      fragment.append(chip);
    }
  }
  if (text.endsWith('\n')) { const tail = document.createElement('br'); tail.dataset.editorTail = ''; fragment.append(tail); }
  el.value.replaceChildren(fragment);
  if (restore) setSelection(restore.start, restore.end);
}
function update(text: string, record = true) {
  // Keep file-picker bookmarks at their logical position while text is edited.
  let prefix = 0, suffix = 0;
  while (prefix < value.length && prefix < text.length && value[prefix] === text[prefix]) prefix++;
  while (suffix < value.length - prefix && suffix < text.length - prefix && value[value.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
  const oldEnd = value.length - suffix, newEnd = text.length - suffix;
  const move = (p: number) => p < prefix ? p : p >= oldEnd ? p + newEnd - oldEnd : newEnd;
  for (const mark of bookmarks) { mark.start = move(mark.start); mark.end = move(mark.end); }
  if (record && text !== value) { history = history.slice(0, historyIndex + 1); history.push(text); if (history.length > 100) history.shift(); historyIndex = history.length - 1; }
  value = text;
  emit('update:text', text);
}
function input() {
  if (composing.value || !el.value) return;
  const text = serialize(el.value), selected = selection();
  update(text);
  render(text, selected);
}
function replace(text: string, selected = selection()) {
  const next = value.slice(0, selected.start) + text + value.slice(selected.end);
  update(next); render(next, { start: selected.start + text.length, end: selected.start + text.length });
}
function undo(redo = false) {
  historyIndex = Math.max(0, Math.min(history.length - 1, historyIndex + (redo ? 1 : -1)));
  const next = history[historyIndex]!;
  update(next, false); render(next, { start: next.length, end: next.length });
}
function beforeInput(event: InputEvent) {
  if (event.isComposing) return;
  if (tokenDrag.isActive()) { event.preventDefault(); return; }
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyRedo'); return; }
  if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) { event.preventDefault(); replace('\n'); return; }
  if (!['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)) return;
  const selected = selection();
  if (selected.start !== selected.end) return;
  const token = splitAttachmentText(value, props.attachments).find(p => p.type === 'attachment' &&
    (event.inputType === 'deleteContentBackward' ? p.start + p.text.length === selected.start : p.start === selected.start));
  if (token) { event.preventDefault(); replace('', { start: token.start, end: token.start + token.text.length }); }
}
function keydown(event: KeyboardEvent) {
  if (tokenDrag.isActive()) { event.preventDefault(); return; }
  emit('keydown', event);
  if (event.defaultPrevented || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); undo(event.shiftKey || event.key.toLowerCase() === 'y');
  }
}
function paste(event: ClipboardEvent) {
  tokenDrag.cancel();
  emit('paste', event);
  if (event.defaultPrevented) return;
  event.preventDefault(); replace(event.clipboardData?.getData('text/plain') ?? '');
}
function preventTokenSelection(event: Event) {
  const target = event.target instanceof Element ? event.target : (event.target as Node)?.parentElement;
  if (target?.closest('[data-attachment-token]')) event.preventDefault();
}
function copy(event: ClipboardEvent, cut = false) {
  const selected = selection();
  event.preventDefault(); event.clipboardData?.setData('text/plain', value.slice(selected.start, selected.end));
  if (cut) replace('', selected);
}
const tokenDrag = useAttachmentTokenDrag(el, (text, caret) => {
  update(text); render(text);
  el.value?.focus(); setSelection(caret);
}, () => render(value));
function createInsertion() {
  const mark = { ...selection() }, scope = props.scope;
  bookmarks.add(mark);
  return { insert(text: string) {
    if (scope !== props.scope || !el.value?.isConnected) return;
    const start = mark.start;
    replace(text, { ...mark }); mark.start = mark.end = start + text.length;
  }, dispose() { bookmarks.delete(mark); } };
}
watch(() => props.text, text => {
  if (text === value || composing.value) return;
  tokenDrag.cancel();
  value = text; history = [text]; historyIndex = 0;
  render(text, document.activeElement === el.value ? { start: text.length, end: text.length } : undefined);
});
watch(() => props.attachments.map(a => a.placeholder).join('|'), () => { tokenDrag.cancel(); if (!composing.value) render(value, document.activeElement === el.value ? selection() : undefined); });
watch(() => props.scope, () => { tokenDrag.cancel(); bookmarks.clear(); history = [props.text]; historyIndex = 0; value = props.text; render(value); lastSelection = { start: value.length, end: value.length }; });
onMounted(() => render(value));
defineExpose({ focus: () => el.value?.focus(), blur: () => el.value?.blur(), el, createInsertion, selection });
</script>
<template>
  <div ref="el" class="composer-input" contenteditable="true" role="textbox" aria-multiline="true" :aria-label="label" :data-placeholder="placeholder"
    @input="input" @beforeinput="beforeInput" @keydown="keydown" @paste="paste" @copy="copy($event)" @cut="copy($event, true)"
    @selectstart="preventTokenSelection"
    @dragstart.prevent
    @pointerdown="tokenDrag.down" @pointermove="tokenDrag.move" @pointerup="tokenDrag.up($event); selection()" @pointercancel="tokenDrag.cancel" @lostpointercapture="tokenDrag.cancel"
    @blur="selection" @keyup="selection" @compositionstart="composing = true" @compositionend="composing = false; input()" />
</template>
<style scoped>
.composer-input { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; cursor:text; }
.composer-input:empty::before { content:attr(data-placeholder); color:var(--fg-subtle); pointer-events:none; }
.composer-input :deep(.inline-attachment-token) { display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 7px; margin:0 2px; border-radius:6px; background:var(--bg-hover); border:1px solid var(--line-strong); color:var(--fg); font-size:.85em; line-height:1.6; vertical-align:baseline; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; cursor:grab; touch-action:none; }
</style>
