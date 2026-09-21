import { onScroll } from './scroll'

/**
 * Magnetic elements: anything marked `data-magnetic` leans toward the pointer
 * when it gets close, and springs back when it leaves.
 *
 * One listener and one rAF loop for the whole page rather than a hook per
 * element — the same reason the scroll broadcaster exists. Rects are measured
 * once and refreshed on scroll and resize, so the hot path is arithmetic
 * only and never forces a layout.
 */

// Beyond this much past an element's own half-size, nothing happens.
const REACH = 46
// Share of the distance the element travels toward the pointer at full pull.
const STRENGTH = 0.34
// Cap, so a wide element cannot slide halfway across its row.
const MAX_SHIFT = 16
// Per-frame easing, as a time constant in ms — matched to the cursor's own
// follow so the two feel like one system.
const TAU = 90
// Under this the transform is cleared entirely, so a resting element carries
// no stale inline style.
const SETTLED = 0.05

let started = false
let items = []
let raf = 0
let pointer = { x: -9999, y: -9999 }
let dirty = true

function refresh() {
  const nodes = document.querySelectorAll('[data-magnetic]')
  items = Array.from(nodes, (el) => {
    const r = el.getBoundingClientRect()
    return {
      el,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      // The pull field is the element's own box plus REACH on every side.
      rx: r.width / 2 + REACH,
      ry: r.height / 2 + REACH,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      near: false,
    }
  })
  dirty = false
}

/** Keeps the eased positions across a re-measure, so scrolling mid-hover
 *  doesn't snap anything back to zero. */
function remeasure() {
  const previous = new Map(items.map((i) => [i.el, i]))
  refresh()
  for (const item of items) {
    const was = previous.get(item.el)
    if (was) {
      item.x = was.x
      item.y = was.y
      item.near = was.near
    }
  }
}

function frame(now) {
  // A nominal step on the first frame of a wake-up: `now - now` is zero, and
  // a zero step means zero easing, which would leave everything exactly where
  // it was and make the loop below conclude it had already settled.
  const dt = frame.last ? Math.min(64, now - frame.last) : 16
  frame.last = now
  const k = 1 - Math.exp(-dt / TAU)

  if (dirty) remeasure()

  let moving = false

  for (const item of items) {
    const dx = pointer.x - item.cx
    const dy = pointer.y - item.cy
    // An elliptical field, so wide elements pull along their length rather
    // than only near their middle.
    const reach = Math.hypot(dx / item.rx, dy / item.ry)

    const near = reach < 1
    if (near) {
      const pull = 1 - reach
      item.tx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx * pull * STRENGTH))
      item.ty = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dy * pull * STRENGTH))
    } else {
      item.tx = 0
      item.ty = 0
    }

    // Published as a class as well, so an element can dress itself for the
    // approach — the contact button sweeps its fill up on this.
    if (near !== item.near) {
      item.near = near
      item.el.classList.toggle('is-near', near)
    }

    item.x += (item.tx - item.x) * k
    item.y += (item.ty - item.y) * k

    // Settled means both where it is and where it is heading — testing only
    // the current offset would stop the loop on the frame a pull begins.
    const still =
      Math.abs(item.x) < SETTLED &&
      Math.abs(item.y) < SETTLED &&
      Math.abs(item.tx) < SETTLED &&
      Math.abs(item.ty) < SETTLED
    if (still) {
      if (item.el.style.transform) item.el.style.transform = ''
      item.x = 0
      item.y = 0
    } else {
      moving = true
      item.el.style.transform = `translate3d(${item.x.toFixed(2)}px, ${item.y.toFixed(2)}px, 0)`
    }
  }

  // Idles completely once everything has settled; the next pointer move
  // starts it again.
  if (moving) {
    raf = requestAnimationFrame(frame)
  } else {
    raf = 0
    frame.last = 0
  }
}

function wake() {
  if (raf) return
  frame.last = 0
  raf = requestAnimationFrame(frame)
}

export function initMagnetic() {
  if (started) return () => {}
  // Nothing to do without a real pointer, and unwelcome if motion is reduced.
  if (!window.matchMedia('(pointer: fine)').matches) return () => {}
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {}
  }
  started = true

  refresh()

  const onMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY }
    wake()
  }

  // Deliberately does not wake the loop. Scrolling fires this every frame,
  // and re-measuring there would force a layout per frame for the whole page
  // — the rects are instead refreshed on the next pointer move, which is the
  // only time they matter.
  const invalidate = () => {
    dirty = true
  }

  const onResize = () => {
    dirty = true
    wake()
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('resize', onResize)
  const unsubscribe = onScroll(invalidate)
  // Sections reveal and fonts land after mount, both of which move things.
  const observer = new MutationObserver(invalidate)
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    started = false
    cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('resize', onResize)
    unsubscribe()
    observer.disconnect()
    for (const item of items) {
      item.el.style.transform = ''
      item.el.classList.remove('is-near')
    }
    items = []
  }
}

/** Call after adding or removing magnetic elements. */
export function refreshMagnetic() {
  dirty = true
  wake()
}
