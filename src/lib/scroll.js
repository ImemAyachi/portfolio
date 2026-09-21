import Lenis from 'lenis'

/**
 * One scroll source for the whole site.
 *
 * Every scroll-driven section used to run its own `scroll` listener and its
 * own rAF loop. This collapses them into a single Lenis-driven loop that
 * publishes position and velocity to subscribers, so the page does one pass
 * of work per frame instead of eight.
 *
 * Lenis moves the real document scroll position (it doesn't fake it with a
 * transform), so `getBoundingClientRect` stays accurate inside subscribers
 * and `position: sticky` keeps working.
 */

// Set at module scope so it lands before the browser gets a chance to
// restore a previous scroll position. With an intro loader the page must
// always begin at the top: the hero is sticky and the next section rides up
// over it, so any restored offset shows as a strip of the following section
// peeking under the hero.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

let lenis = null
let rafId = 0
const subscribers = new Set()

const state = {
  y: 0,
  velocity: 0,
  // +1 scrolling down, -1 up.
  direction: 1,
}

function publish() {
  subscribers.forEach((fn) => {
    try {
      fn(state)
    } catch (error) {
      // One bad subscriber shouldn't stop the rest of the page updating.
      console.error('scroll subscriber failed', error)
    }
  })
}

export function initScroll() {
  if (lenis) return lenis

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  lenis = new Lenis({
    // Near-instant when motion is reduced: the subscriber pipeline still
    // runs, but without the glide.
    duration: reduced ? 0.01 : 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: !reduced,
    // Touch devices already have good native inertia; overriding it feels worse.
    syncTouch: false,
  })

  lenis.on('scroll', ({ scroll, velocity, direction }) => {
    state.y = scroll
    state.velocity = velocity
    if (direction !== 0) state.direction = direction
    publish()
  })

  const frame = (time) => {
    lenis.raf(time)
    rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)

  // Resize changes every measurement subscribers depend on.
  window.addEventListener('resize', publish, { passive: true })

  return lenis
}

export function destroyScroll() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  window.removeEventListener('resize', publish)
  lenis?.destroy()
  lenis = null
}

/** Subscribe to scroll updates. Fires once immediately. Returns an unsubscribe. */
export function onScroll(fn) {
  subscribers.add(fn)
  fn(state)
  return () => subscribers.delete(fn)
}

/** Smoothly scroll to a target (selector, element or offset). */
export function scrollTo(target, options) {
  lenis?.scrollTo(target, { offset: -90, duration: 1.2, ...options })
}

/**
 * Freeze the page behind an overlay. Lenis has to be stopped as well as the
 * body locked — it drives scrolling itself, so `overflow: hidden` alone
 * wouldn't stop it. Returns the page to where it was on unlock.
 */
let locked = false

export function lockScroll() {
  locked = true
  lenis?.stop()
  document.body.classList.add('is-locked')
}

export function unlockScroll() {
  locked = false
  document.body.classList.remove('is-locked')
  lenis?.start()
}

/**
 * True while an overlay is up. Ambient animations check this and idle,
 * so they aren't competing for frames during an overlay transition.
 */
export function isScrollLocked() {
  return locked
}

/**
 * Progress of an element through the viewport, 0 as its top reaches the
 * bottom of the screen to 1 once its bottom has passed the top. Shared
 * because five sections were each deriving this the same way.
 */
export function viewportProgress(el) {
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  const travel = rect.height + window.innerHeight
  if (travel <= 0) return 0
  return Math.min(1, Math.max(0, (window.innerHeight - rect.top) / travel))
}
