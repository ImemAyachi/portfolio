import { useEffect, useRef, useState } from 'react'
// Waited on directly: the hero looks broken until these two have decoded,
// so the reveal is gated on them rather than on a fixed timer.
import portraitUrl from '../assets/hero-portrait-trimmed.png'
import inkUrl from '../assets/hero-portrait-ink-trimmed.png'
import './Loader.css'

// Floor and ceiling on the hold. The floor lets the draw-in finish and stops
// the loader flashing past on a warm cache; the ceiling means a stalled asset
// can never strand anyone on a blank cream screen.
const MIN_HOLD_MS = 1350
const MAX_HOLD_MS = 5000
// How long the whole growing phase lasts.
const FLY_MS = 1200
// How much of it the growth itself occupies. It finishes early and holds:
// growing by equal ratios means most of the covering happens in the last few
// frames, so ending exactly on the flash would leave the corners short
// whenever a timer ran a frame or two late. By the time it stops the screen
// is solid ink, so the hold is invisible.
const GROWTH_MS = Math.round(FLY_MS * 0.8)
// How long the full-ink "flash" hold lasts once the sparkle has grown to
// cover the screen.
const FLASH_MS = 200
// How long the whole loader takes to fade out, revealing the site underneath.
const EXIT_MS = 550

// How finely the growth is sampled. It has to be dense: the shape is
// interpolated linearly between stops but grows geometrically, so a sparse
// set makes each segment start fast and end slow — a visible pulse. At this
// count no segment spans more than about a 1.17x ratio, which reads as one
// continuous expansion.
const GROWTH_STOPS = 60
// Shapes the growth. 1 would be a dead-constant rate; a little above it
// starts the sparkle gently and lets it accelerate away without ever
// changing direction or pausing.
const GROWTH_EASE = 1.35
// How far the sparkle has to drop to sit at the centre of the screen: it
// rests at 14.75% down the letter box and the centre is 50%, and the box is
// exactly 1em tall.
const CENTRE_DROP_EM = 0.3525

// The sparkle is a 4-point concave shape: its tips reach ~50% of its own
// bounding size from centre, but the notches between tips only reach ~20.7%
// (measured from the traced path). It grows from rest with its tips on the
// cardinal axes, which means those shallow notches point straight at the
// viewport's corners — the single farthest, hardest-to-cover point on the
// screen. Sizing off the tip radius would leave the corners exposed, so this
// factor is derived from the notch radius instead: 1 / (2 * 0.2071) ≈ 2.414,
// plus a little headroom for antialiasing at the edge.
const COVERAGE_SAFETY = 2.6

export default function Loader({ onDone }) {
  // phase: 'logo' -> 'spin' -> 'flash' -> 'exit' -> 'gone'
  const [phase, setPhase] = useState('logo')
  const dotRef = useRef(null)

  // Hold the page still behind the overlay; released in the 'exit' effect
  // below, as the site is revealed.
  useEffect(() => {
    document.body.classList.add('is-loading')
    // Belt and braces alongside history.scrollRestoration in lib/scroll:
    // a restored offset would leave the next section visible beneath the
    // hero the moment the loader clears.
    window.scrollTo(0, 0)
    return () => document.body.classList.remove('is-loading')
  }, [])

  useEffect(() => {
    // Timed from the first frame, not from here. CSS animations do not start
    // their clocks until the document first paints, and the render-blocking
    // font stylesheet holds that off by several hundred milliseconds — timing
    // the hold from mount would start the sparkle growing while the mark was
    // still drawing itself, and it would jump. rAF fires on that same first
    // frame, so this shares an origin with the animations it is waiting for.
    let started = performance.now()
    const frame = requestAnimationFrame(() => {
      started = performance.now()
    })
    let launched = false
    let holdTimer = 0
    // The asset wait below settles on its own schedule, long after this effect
    // may have been torn down — and a discarded run still holds a clock from
    // before the first paint, so it would launch early and start a second
    // growth over the top of the live one, visibly restarting it partway.
    let dropped = false

    const launch = () => {
      if (launched) return
      launched = true
      // Measure the sparkle's real on-screen size right before launch and
      // work out exactly how big it needs to grow to cover *this* viewport —
      // rather than a guessed constant that only looks right at one size.
      const el = dotRef.current
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')
      if (el && !still?.matches) {
        const rect = el.getBoundingClientRect()
        // The smaller side, not the larger. The box is taller than it is wide,
        // and the viewBox is square, so the sparkle is fitted into the width
        // and letterboxed vertically — measuring the height would describe a
        // sparkle bigger than the one actually drawn, and the scale derived
        // from it leaves the corners uncovered on a narrow screen.
        const size = Math.min(rect.width, rect.height) || 1
        const diagonal = Math.hypot(window.innerWidth, window.innerHeight)
        const target = (diagonal / size) * COVERAGE_SAFETY

        // Built here rather than written as CSS keyframes because the curve
        // depends on `target`, which is only known once the viewport has been
        // measured — and because it takes far more stops than are reasonable
        // to write by hand.
        //
        // The scale is geometric: each step multiplies rather than adds. A
        // shape doubling from 1 to 2 and one going from 100 to 101 cover the
        // same distance but read as wildly different speeds, so growing by
        // equal *amounts* looks like it stalls the moment it gets big. Equal
        // *ratios* is what reads as one steady expansion.
        const frames = Array.from({ length: GROWTH_STOPS }, (_, i) => {
          const t = i / (GROWTH_STOPS - 1)
          const grow = Math.pow(t, GROWTH_EASE)
          // The drop to centre eases out instead, so the sparkle leaves its
          // perch promptly — by the time it is large the move is invisible.
          const settle = 1 - (1 - t) * (1 - t)
          const drop = (CENTRE_DROP_EM * settle).toFixed(4)
          return {
            transform: `translate(0, ${drop}em) scale(${Math.pow(target, grow).toFixed(3)})`,
          }
        })

        // linear, and deliberately so. An easing here would be re-applied
        // between every pair of stops rather than across the whole run, which
        // is what made the old four-keyframe version surge and stall four
        // times over. The shaping lives in the values instead.
        el.animate(frames, {
          duration: GROWTH_MS,
          easing: 'linear',
          fill: 'forwards',
        })
      }
      setPhase('spin')
    }

    const decoded = (src) =>
      new Promise((resolve) => {
        const img = new Image()
        // Resolve on error too — a missing asset shouldn't wedge the loader.
        img.onload = img.onerror = resolve
        img.src = src
      })

    Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      decoded(portraitUrl),
      decoded(inkUrl),
    ]).then(() => {
      if (dropped) return
      // Hold the floor even on a warm cache, so the draw-in gets to finish.
      const remaining = Math.max(0, MIN_HOLD_MS - (performance.now() - started))
      holdTimer = setTimeout(launch, remaining)
    })

    // Ceiling: a stalled asset can never strand anyone on a blank screen.
    const capTimer = setTimeout(launch, MAX_HOLD_MS)

    return () => {
      dropped = true
      cancelAnimationFrame(frame)
      clearTimeout(holdTimer)
      clearTimeout(capTimer)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'spin') return
    const t = setTimeout(() => setPhase('flash'), FLY_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'flash') return
    const t = setTimeout(() => setPhase('exit'), FLASH_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'exit') return
    // Let the site behind start revealing — and scrolling — right as we begin
    // fading the loader out. The component renders null at 'gone' rather than
    // unmounting, so this can't be left to the mount effect's cleanup.
    document.body.classList.remove('is-loading')
    onDone?.()
    const t = setTimeout(() => setPhase('gone'), EXIT_MS)
    return () => clearTimeout(t)
  }, [phase, onDone])

  if (phase === 'gone') return null

  const flying = phase === 'spin' || phase === 'flash' || phase === 'exit'

  return (
    <div className={`loader loader--${phase}`} aria-hidden="true">
      <span className="loader__mark">
        <span className="loader__letter">
          {/* Wrapped so the stem can be wiped in on its own — clipping the
              letter itself would take the sparkle with it. */}
          <span className="loader__glyph">
            i
            {/* Covers the font's own dot so the synthetic one below can grow
                free without leaving a duplicate behind. */}
            <span className="loader__dot-mask" />
          </span>
          {/* Traced directly from the Amoria glyph's own outline (extracted
              from the font file) so the shape matches exactly. */}
          <svg
            ref={dotRef}
            className={`loader__dot ${flying ? 'loader__dot--fly' : ''}`}
            viewBox="0 0 180.2 180.2"
          >
            <path d="M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z" />
          </svg>
        </span>
      </span>

      <span
        className={`loader__signature ${
          phase !== 'logo' ? 'loader__signature--exit' : ''
        }`}
      >
        Imem Ayachi
      </span>
      <div className="loader__flash" />
    </div>
  )
}
