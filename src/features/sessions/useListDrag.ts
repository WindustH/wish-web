// Dragging the list's entries onto folders, as a file manager drags files. A folder takes what is
// dropped on it; held over a folder a moment, the drag opens it, so an entry can go deeper; the
// path above takes it back up, and the open folder's own room takes it there.
//
// With a mouse it is the browser's own drag and drop. What is dragged is named in the drag's data,
// so a stale drag or a file dragged in from elsewhere moves nothing.
//
// With a finger, a row drags as soon as the finger moves sideways, or any way once the press has
// been held, as it opens the row's menu, which the drag closes; a label rides above the finger,
// and lifting drops where the finger is. A finger that sets off up or down before the press is
// held scrolls the list. The places are marked `data-drop-place` - a folder's id, or `/` for the
// root - and `data-drop-opens` on a folder the drag may open.
import { onBeforeUnmount, shallowRef } from 'vue';
import { closeMenus } from '../../ui/components/Menu.vue';

const TYPE = 'application/x-wish-entries';
const SPRING_MS = 700;
// As long as a press opens a row's menu; a finger moving less than SLOP is still.
const ARM_MS = 450;
const SLOP = 10;
/** Where a drop goes: a folder's id, or null for the root. */
type Place = string | null;

export function useListDrag(move: (ids: string[], into: Place) => void, open: (folder: string) => void) {
  // What is dragged, and the folder it all comes from (undefined when it comes from several).
  const dragging = shallowRef<{ ids: string[]; from: Place | undefined } | null>(null);
  // The place a drop would go now; undefined for none.
  const over = shallowRef<Place | undefined>(undefined);
  // What a finger drags, where it is.
  const ghost = shallowRef<{ x: number; y: number; label: string } | null>(null);
  let spring: ReturnType<typeof setTimeout> | undefined;

  function start(event: DragEvent, ids: string[], from: Place | undefined, link?: string) {
    const data = event.dataTransfer;
    if (!data) return;
    dragging.value = { ids, from };
    data.effectAllowed = 'move';
    data.setData(TYPE, ids.join('\n'));
    // Dropped on the browser's tabs, a session or group opens there.
    if (link) data.setData('text/uri-list', link);
    if (ids.length > 1) {
      const badge = document.createElement('div');
      badge.className = 'sl-drag-badge';
      badge.textContent = String(ids.length);
      document.body.append(badge);
      data.setDragImage(badge, 14, 14);
      setTimeout(() => badge.remove());
    }
  }
  const ours = (event: DragEvent) => !!dragging.value && !!event.dataTransfer?.types.includes(TYPE);
  // Nothing goes into itself, and nothing moves to where it already is.
  const takes = (place: Place) => !!dragging.value && !(place && dragging.value.ids.includes(place)) && place !== dragging.value.from;

  /** dragenter and dragover on a place; a folder held over (`opens`) is opened after a moment. */
  function hover(event: DragEvent, place: Place, opens = false) {
    if (!ours(event)) return;
    if (takes(place)) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'move';
      over.value = place;
    }
    if (event.type === 'dragenter' && opens && place && !dragging.value!.ids.includes(place)) {
      clearTimeout(spring);
      spring = setTimeout(() => { over.value = undefined; open(place); }, SPRING_MS);
    }
  }
  function leave(event: DragEvent, place: Place) {
    if ((event.currentTarget as Node).contains(event.relatedTarget as Node | null)) return;
    if (over.value === place) over.value = undefined;
    clearTimeout(spring);
  }
  function drop(event: DragEvent, place: Place) {
    if (!ours(event) || !takes(place)) return;
    event.preventDefault();
    const { ids } = dragging.value!;
    end();
    move(ids, place);
  }
  function end() {
    dragging.value = null;
    over.value = undefined;
    ghost.value = null;
    clearTimeout(spring);
  }
  window.addEventListener('dragend', end);

  // A finger's press: where it began, what it would drag, and whether it has been held.
  let press: { ids: string[]; from: Place | undefined; label: string; x: number; y: number; armed: boolean; timer: ReturnType<typeof setTimeout> } | undefined;
  function press_(event: TouchEvent, ids: string[], from: Place | undefined, label: string) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return;
    release();
    press = { ids, from, label, x: touch.clientX, y: touch.clientY, armed: false, timer: setTimeout(() => { if (press) press.armed = true; }, ARM_MS) };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', release);
  }
  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!press || !touch) return;
    if (!ghost.value) {
      const dx = touch.clientX - press.x, dy = touch.clientY - press.y;
      if (Math.hypot(dx, dy) < SLOP) return;
      if (!press.armed && Math.abs(dx) <= Math.abs(dy)) { release(); return; }
      dragging.value = { ids: press.ids, from: press.from };
      closeMenus();
    }
    // The page holds still while the finger drags.
    event.preventDefault();
    ghost.value = { x: touch.clientX, y: touch.clientY, label: press.label };
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-drop-place]');
    const place = target ? (target.dataset.dropPlace === '/' ? null : target.dataset.dropPlace!) : undefined;
    const next = place !== undefined && takes(place) ? place : undefined;
    if (next === over.value) return;
    over.value = next;
    clearTimeout(spring);
    if (next && target?.dataset.dropOpens != null) spring = setTimeout(() => { over.value = undefined; open(next); }, SPRING_MS);
  }
  function onTouchEnd() {
    const place = over.value, ids = dragging.value?.ids;
    const dragged = !!ghost.value;
    release();
    if (dragged && ids && place !== undefined) move(ids, place);
  }
  function release() {
    if (press) clearTimeout(press.timer);
    press = undefined;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', release);
    if (ghost.value) end();
  }
  onBeforeUnmount(() => { window.removeEventListener('dragend', end); release(); clearTimeout(spring); });

  return { dragging, over, ghost, start, hover, leave, drop, press: press_ };
}
