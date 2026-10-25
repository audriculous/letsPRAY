// Drag to reorder. Hold an item (touch) or drag it (mouse) and the others
// slide out of the way; letting go hands the new order to `onDrop`.
//
// Mark a container with data-sortable="name" and its items with
// data-sort-id. Anything with class "sort-handle" starts a drag straight
// away, without the hold, so it suits long lists you also scroll.

const HOLD = 320; // ms a finger rests before the item lifts
const SLOP = 8; // px a finger can wander during the hold (more is a scroll)
const MOUSE_SLOP = 5;
const EDGE = 70; // px from the top or bottom of the screen that scrolls
const FLIP_MS = 200;

let pending = null;
let drag = null;
let hooks = {};

const itemsOf = (box) => [...box.querySelectorAll(':scope > [data-sort-id]')];
const orderOf = (box) => itemsOf(box).map((el) => el.dataset.sortId);

export function enableSorting(options) {
  hooks = options;
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', (e) => moveTo(e.clientX, e.clientY, e.pointerType));
  document.addEventListener('pointerup', () => (drag ? finish() : cancelPending()));
  document.addEventListener('pointercancel', () => {
    // A finger mid-drag can get a cancel as the browser considers scrolling;
    // the touch events below carry on and finish the drag.
    if (drag && !drag.touch) finish();
    else if (!drag) cancelPending();
  });
  // Once an item is lifted the page must not scroll under the finger.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) moveTo(t.clientX, t.clientY, 'touch');
    },
    { passive: false },
  );
  document.addEventListener('touchend', () => drag?.touch && finish());
  document.addEventListener('touchcancel', () => drag?.touch && finish());
  // Links and images would otherwise start the browser's own drag.
  document.addEventListener('dragstart', (e) => e.target.closest?.('[data-sortable]') && e.preventDefault());
  document.addEventListener('contextmenu', (e) => (drag || pending?.touch) && e.target.closest?.('[data-sortable]') && e.preventDefault());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && drag && finish(true));
}

function down(e) {
  if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  cancelPending();
  const el = e.target.closest('[data-sort-id]');
  const box = el?.parentElement;
  if (!box?.matches('[data-sortable]')) return;
  const onHandle = !!e.target.closest('.sort-handle');
  if (!onHandle && e.target.closest('button, input, textarea, select, label')) return;
  pending = { el, box, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', onHandle };
  if (onHandle) start();
  else if (pending.touch) pending.timer = setTimeout(start, HOLD);
}

function cancelPending() {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}

function start() {
  const { el, box, x, y, touch } = pending;
  cancelPending();
  const r = el.getBoundingClientRect();
  drag = { el, box, touch, x, y, gx: x - r.left, gy: y - r.top, before: orderOf(box) };
  el.classList.add('is-dragging');
  box.classList.add('is-sorting');
  hooks.onStart?.();
  place();
  scrollLoop();
}

function moveTo(x, y, type) {
  if (pending && !drag) {
    const far = Math.hypot(x - pending.x, y - pending.y);
    if (type === 'mouse' && !pending.touch && far > MOUSE_SLOP) start();
    else if (pending.touch && far > SLOP) cancelPending(); // it's a scroll
    if (!drag) return;
  }
  if (!drag) return;
  drag.x = x;
  drag.y = y;
  reorder();
  place();
}

// Where the items sit in the layout, ignoring any slide in progress, so an
// item that is still sliding away can't bounce straight back.
function slot(el) {
  return { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };
}

function reorder() {
  const { el, box } = drag;
  const b = box.getBoundingClientRect();
  const px = drag.x - b.left - box.clientLeft;
  const py = drag.y - b.top - box.clientTop;
  const items = itemsOf(box);
  const over = items.find((it) => {
    if (it === el) return false;
    const s = slot(it);
    return px >= s.left && px < s.right && py >= s.top && py < s.bottom;
  });
  if (!over) return;
  const from = items.indexOf(el);
  const to = items.indexOf(over);
  flip(items, () => box.insertBefore(el, to > from ? over.nextSibling : over));
}

// Moves the others with a short slide from where they were.
function flip(items, mutate) {
  const others = items.filter((it) => it !== drag.el);
  const was = others.map((it) => it.getBoundingClientRect());
  mutate();
  others.forEach((it, i) => {
    const now = it.getBoundingClientRect();
    const dx = was[i].left - now.left;
    const dy = was[i].top - now.top;
    if (!dx && !dy) return;
    it.style.transition = 'none';
    it.style.transform = `translate(${dx}px, ${dy}px)`;
    it.getBoundingClientRect(); // apply before sliding
    it.style.transition = `transform ${FLIP_MS}ms ease`;
    it.style.transform = '';
    clearTimeout(it.flipTimer);
    it.flipTimer = setTimeout(() => (it.style.transition = ''), FLIP_MS + 20);
  });
}

// Keeps the lifted item under the finger or pointer.
function place() {
  const { el } = drag;
  el.style.transform = 'none';
  const r = el.getBoundingClientRect();
  el.style.transform = `translate(${drag.x - drag.gx - r.left}px, ${drag.y - drag.gy - r.top}px) scale(1.03)`;
}

// Scrolls when the item is held near the top or bottom of the screen.
function scrollLoop() {
  if (!drag) return;
  const bottomEdge = window.innerHeight - EDGE - (document.querySelector('.nav')?.offsetHeight || 0) * (window.innerWidth <= 760 ? 1 : 0);
  let dy = 0;
  if (drag.y < EDGE) dy = -Math.ceil((EDGE - drag.y) / 6);
  else if (drag.y > bottomEdge) dy = Math.ceil((drag.y - bottomEdge) / 6);
  if (dy) {
    const before = window.scrollY;
    window.scrollBy(0, dy);
    if (window.scrollY !== before) {
      reorder();
      place();
    }
  }
  requestAnimationFrame(scrollLoop);
}

function finish(cancelled = false) {
  const d = drag;
  drag = null;
  const { el, box } = d;
  if (cancelled) {
    const byId = new Map(itemsOf(box).map((it) => [it.dataset.sortId, it]));
    const end = itemsOf(box).at(-1).nextSibling;
    for (const id of d.before) box.insertBefore(byId.get(id), end);
  }
  // Settle into its new place.
  el.style.transition = `transform ${FLIP_MS}ms ease`;
  el.classList.remove('is-dragging');
  el.style.transform = '';
  setTimeout(() => (el.style.transition = ''), FLIP_MS + 20);
  box.classList.remove('is-sorting');
  // The click that follows letting go is not a tap on the item.
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
  const after = orderOf(box);
  const changed = !cancelled && after.join('\n') !== d.before.join('\n');
  // Let the slide finish before the screen redraws with the saved order.
  setTimeout(() => {
    hooks.onEnd?.();
    if (changed) hooks.onDrop?.(box.dataset.sortable, after);
  }, FLIP_MS);
}
