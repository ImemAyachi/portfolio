import { useCallback, useEffect, useRef } from 'react'
import { onScroll, viewportProgress } from '../lib/scroll'
import RagdollHand from './RagdollHand'
import './About.css'

const SPARKLE =
  'M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z'

const BANNER = ['Fullstack developer', 'Tunis, Tunisia', 'Building for the web']

/** Tunisia's flag, drawn rather than fetched. Real colours — it's a national
 *  flag, so it shouldn't be recoloured to match the palette.
 *
 *  The crescent and star are cut as a single even-odd path instead of being
 *  stacked as separate filled shapes: overlapping fills leave hairline seams
 *  where their antialiased edges meet, which is what made the small size look
 *  soft rather than crisp. */
function TunisiaFlag() {
  return (
    <svg
      className="ab__flag"
      viewBox="0 0 900 600"
      role="img"
      aria-label="Flag of Tunisia"
      shapeRendering="geometricPrecision"
    >
      <rect width="900" height="600" fill="#E70013" />
      <circle cx="450" cy="300" r="150" fill="#fff" />
      <path
        fill="#E70013"
        fillRule="evenodd"
        d="M450,202.5 a97.5,97.5 0 1,0 0,195 a97.5,97.5 0 1,0 0,-195 Z
           M483.75,222 a78,78 0 1,1 0,156 a78,78 0 1,1 0,-156 Z"
      />
      <polygon
        fill="#E70013"
        points="495,247.5 506.79,283.77 544.93,283.78 514.08,306.2 525.86,342.47 495,320.06 464.14,342.47 475.92,306.2 445.07,283.78 483.21,283.77"
      />
    </svg>
  )
}

/** Stands in for the photo that will sit above the signature. Framed and
 *  labelled rather than left as a grey box, so the block reads as finished
 *  layout while the real image is still missing. */
function PortraitPlaceholder() {
  return (
    <div className="ab__portrait" role="img" aria-label="Portrait placeholder">
      <svg className="ab__portrait-art" viewBox="0 0 120 150" aria-hidden="true">
        <circle cx="60" cy="56" r="24" />
        <path d="M18,150 C18,110 36,92 60,92 C84,92 102,110 102,150 Z" />
      </svg>
      <span className="ab__portrait-note">Portrait</span>
    </div>
  )
}

// How long to let the title finish rising before the hand waves hello.
const WAVE_DELAY_MS = 900

export default function About() {
  const sectionRef = useRef(null)
  const handRef = useRef(null)

  // Restarting a CSS animation needs the class removed, a reflow forced, then
  // the class re-added — without the reflow the browser coalesces the two
  // changes and nothing replays.
  const wave = useCallback(() => {
    const el = handRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.classList.remove('is-waving')
    void el.offsetWidth
    el.classList.add('is-waving')
  }, [])

  // One-shot entry reveal, which is also what cues the wave.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    let waveTimer = 0

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('is-revealed')
            waveTimer = setTimeout(wave, WAVE_DELAY_MS)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.2 }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(waveTimer)
    }
  }, [wave])

  // Continuous scroll- and pointer-linked motion, published as custom
  // properties so the movement itself stays in CSS.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const unsubscribe = onScroll(() => {
      el.style.setProperty('--p', viewportProgress(el).toFixed(4))
    })

    const onPointerMove = (event) => {
      const rect = el.getBoundingClientRect()
      el.style.setProperty(
        '--mx',
        ((event.clientX - rect.left) / rect.width - 0.5).toFixed(4)
      )
      el.style.setProperty(
        '--my',
        ((event.clientY - rect.top) / rect.height - 0.5).toFixed(4)
      )
    }

    el.addEventListener('pointermove', onPointerMove)
    return () => {
      unsubscribe()
      el.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return (
    <section className="ab" ref={sectionRef} id="about-me">
      {/* Hovering anywhere in the head gets another wave out of the hand. */}
      <div className="ab__inner ab__head" onMouseEnter={wave}>
        {/* Amoria over Anton — the same pairing as the logo, at scale. Each
            line is a mask with the text riding up inside it, so the reveal
            is clipped rather than sliding over what's below. */}
        <h2 className="ab__title">
          <span className="ab__line" style={{ '--drift': -34 }}>
            <span className="ab__line-inner ab__title-serif">Nice to</span>
          </span>
          <span className="ab__line" style={{ '--drift': 26 }}>
            <span className="ab__line-inner ab__title-heavy">
              Meet you
              <svg
                className="ab__title-mark"
                viewBox="0 0 180.2 180.2"
                aria-hidden="true"
              >
                <path d={SPARKLE} />
              </svg>
            </span>
          </span>
        </h2>

        {/* Fills the empty right-hand half of the title row — and can be
            picked up and thrown around the section. */}
        <RagdollHand handRef={handRef} />
      </div>

      {/* Deliberately outside the centred column: the bar and its torn edge
          run the full width of the section. */}
      <div className="ab__banner">
        {BANNER.map((item, i) => (
          <span className="ab__banner-item" key={item} tabIndex={0}>
            <span className="ab__banner-label">{item}</span>
            {i < BANNER.length - 1 && (
              <svg
                className="ab__banner-mark"
                viewBox="0 0 180.2 180.2"
                aria-hidden="true"
              >
                <path d={SPARKLE} />
              </svg>
            )}
          </span>
        ))}
      </div>

      <div className="ab__inner">
        <div className="ab__row">
          {/* PLACEHOLDER — written to fit the layout. Replace with your own. */}
          <p className="ab__text">
            I build for the web, front to back. What keeps me interested is the
            point where the interface and the data model have to agree with each
            other — and the last ten percent most people skip, where a thing
            stops feeling like software and starts feeling considered. I work
            from Tunisia, with people anywhere.
          </p>

          <div className="ab__mark">
            <PortraitPlaceholder />
            <div className="ab__sign-row">
              {/* Wrapper carries the travelling nib; the inner span is the
                  part that gets wiped in, so the nib is not clipped by it. */}
              <span className="ab__signature">
                <span className="ab__signature-ink">Imem Ayachi</span>
              </span>
              <span className="ab__flag-wrap">
                <TunisiaFlag />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
