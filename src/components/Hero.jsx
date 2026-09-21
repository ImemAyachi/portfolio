import { useEffect, useLayoutEffect, useRef } from 'react'
import { onScroll } from '../lib/scroll'
import portrait from '../assets/hero-portrait-trimmed.png'
// Illustrated twin, trimmed to exactly the same box as the photo so the two
// figures register without any offset.
import inkPortrait from '../assets/hero-portrait-ink-trimmed.png'
import './Hero.css'

// How far each word runs off its own edge, and the width of the empty band
// left between them for the subject — both as a share of the viewport.
const NAME_BLEED_VW = 0.9
const NAME_GAP_VW = 15

// "Imem" and "Ayachi" are different lengths, so at one shared scale the gap
// between them lands off-centre. Giving each word its own horizontal scale —
// so both render to the same width — puts the gap dead centre while the
// bleed off each edge stays equal.
function Name() {
  const leftRef = useRef(null)
  const rightRef = useRef(null)

  useLayoutEffect(() => {
    const left = leftRef.current
    const right = rightRef.current
    if (!left || !right) return

    const fit = () => {
      left.style.transform = 'none'
      right.style.transform = 'none'
      const leftNatural = left.getBoundingClientRect().width
      const rightNatural = right.getBoundingClientRect().width
      if (!leftNatural || !rightNatural) return

      const vw = window.innerWidth
      const bleed = (NAME_BLEED_VW / 100) * vw
      const gap = (NAME_GAP_VW / 100) * vw
      const target = vw / 2 + bleed - gap / 2

      left.style.transform = `scaleX(${target / leftNatural})`
      right.style.transform = `scaleX(${target / rightNatural})`
    }

    fit()
    // Re-fit once the real (non-fallback) fonts have settled.
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <h1 className="hero__name" aria-label="Imem Ayachi">
      <span
        ref={leftRef}
        className="hero__name-word hero__name-word--left"
        aria-hidden="true"
      >
        Imem
      </span>
      <span
        ref={rightRef}
        className="hero__name-word hero__name-word--right"
        aria-hidden="true"
      >
        Ayachi
      </span>
    </h1>
  )
}

// Trailing points that make up the reveal blob. Each chases the pointer at
// its own rate, so they string out behind it and merge into one gooey shape
// rather than a single hard circle.
const BLOBS = [
  { ease: 0.3, radius: 19 },
  { ease: 0.17, radius: 14.5 },
  { ease: 0.1, radius: 10.5 },
]

export default function Hero() {
  const heroRef = useRef(null)
  const figureRef = useRef(null)
  const inkRef = useRef(null)
  const warpRef = useRef(null)

  // Liquid reveal: the illustrated layer is masked by the blob above, which
  // eases toward the pointer and breathes, so its edge is never still.
  useEffect(() => {
    const figure = figureRef.current
    const ink = inkRef.current
    const warp = warpRef.current
    if (!figure || !ink) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const target = { x: 50, y: 50 }
    const points = BLOBS.map((b) => ({ ...b, x: 50, y: 50 }))
    let hovering = false
    let intensity = 0
    let raf = 0

    const loop = (now) => {
      const t = now / 1000
      // Radius scales with intensity, so the blob grows out of nothing on
      // enter and shrinks away on leave instead of popping.
      intensity += ((hovering ? 1 : 0) - intensity) * 0.12
      // Exponential decay never quite reaches zero; snap it, or the filter
      // is left running on an invisible layer long after the pointer leaves.
      if (!hovering && intensity < 0.02) intensity = 0

      points.forEach((p, i) => {
        p.x += (target.x - p.x) * p.ease
        p.y += (target.y - p.y) * p.ease
        const wobble = 1 + Math.sin(t * 2.2 + i * 1.7) * 0.15
        ink.style.setProperty(`--x${i}`, `${p.x.toFixed(2)}%`)
        ink.style.setProperty(`--y${i}`, `${p.y.toFixed(2)}%`)
        ink.style.setProperty(
          `--r${i}`,
          `${(p.radius * wobble * intensity).toFixed(2)}%`
        )
      })

      // The turbulence filter is expensive, so only carry it while the
      // reveal is actually on screen.
      if (warp) {
        const live = intensity > 0
        if (live !== warp.classList.contains('is-live')) {
          warp.classList.toggle('is-live', live)
        }
      }

      raf = requestAnimationFrame(loop)
    }

    const onMove = (event) => {
      const r = figure.getBoundingClientRect()
      target.x = ((event.clientX - r.left) / r.width) * 100
      target.y = ((event.clientY - r.top) / r.height) * 100
    }

    const onEnter = (event) => {
      hovering = true
      // Start the blob where the pointer entered, so it doesn't sweep across.
      onMove(event)
      points.forEach((p) => {
        p.x = target.x
        p.y = target.y
      })
    }

    const onLeave = () => {
      hovering = false
    }

    raf = requestAnimationFrame(loop)
    figure.addEventListener('pointermove', onMove)
    figure.addEventListener('pointerenter', onEnter)
    figure.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      figure.removeEventListener('pointermove', onMove)
      figure.removeEventListener('pointerenter', onEnter)
      figure.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  // How far the next section has ridden up over this one, 0 → 1 across the
  // first viewport of scroll. Drives the dimming overlay in CSS.
  useEffect(() => {
    const el = heroRef.current
    if (!el) return

    return onScroll(() => {
      const cover = Math.min(1, Math.max(0, window.scrollY / window.innerHeight))
      el.style.setProperty('--cover', cover.toFixed(4))
    })
  }, [])

  return (
    <header className="hero" ref={heroRef}>
      {/* One line of type — the two words sit on a shared baseline and are
          pushed to opposite edges, leaving the middle for the subject. */}
      <Name />

      <div className="hero__figure" ref={figureRef}>
        <img className="hero__photo" src={portrait} alt="Imem Ayachi" />
        {/* The wrapper carries the turbulence filter and the image carries
            the mask. Filter-on-the-outside is what makes the *edge* of the
            reveal ripple — filtering the image itself would still leave a
            clean circular mask cutting it. */}
        <div className="hero__ink-warp" ref={warpRef}>
          <img
            className="hero__ink"
            src={inkPortrait}
            alt=""
            aria-hidden="true"
            ref={inkRef}
          />
        </div>
      </div>

      {/* Displacement source for the reveal edge. */}
      <svg className="hero__defs" aria-hidden="true" focusable="false">
        <filter
          id="hero-liquid"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          {/* Deliberately static, and one octave. Animating baseFrequency
              regenerates the whole noise field every frame and halved the
              framerate to 30fps when measured; the blob travelling across a
              fixed field already gives an edge that churns as it moves, and
              the browser can cache the field. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.013 0.019"
            numOctaves="1"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="30"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <div className="hero__signature" aria-hidden="true">
        <span className="hero__signature-text">Imem Ayachi</span>
        <svg
          className="hero__signature-flourish"
          viewBox="0 0 400 44"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M3 34 C70 12 150 3 236 8 C300 12 356 22 397 38"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="hero__meta">
        <span className="hero__meta-index">01</span>
        <span className="hero__meta-rule" />
        <p className="hero__meta-text">
          <span>Driven by passion.</span>
          <span>Defined by focus.</span>
        </p>
      </div>

      <div className="hero__socials">
        <a href="#instagram">Instagram</a>
        <span className="hero__socials-rule" aria-hidden="true" />
        <a href="#twitter">Twitter</a>
        <span className="hero__socials-rule" aria-hidden="true" />
        <a href="#youtube">Youtube</a>
      </div>

      <div className="hero__scroll">
        <span>Scroll</span>
        <span className="hero__scroll-line" aria-hidden="true" />
      </div>
    </header>
  )
}
