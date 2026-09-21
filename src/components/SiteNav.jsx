import { useEffect, useLayoutEffect, useRef } from 'react'
import { onScroll } from '../lib/scroll'
import ScrambleText from './ScrambleText'
import './SiteNav.css'

const NAV_LINKS = ['Home', 'Career', 'Results', 'Gallery', 'Partners', 'News']

// Above this relative luminance the bar has to switch to ink to stay legible.
// The cream sections sit at 0.89 and cross it; the grey used by the hero and
// projects sits at 0.60 and deliberately does not, so the bar stays cream
// there as it always has.
const LIGHT_LUMINANCE = 0.7

/**
 * The wordmark gets its own, much lower threshold: it keeps its ink weight on
 * everything pale enough to carry it — including the grey hero, where ink
 * reads far better than the cream the links switch to — and flips only on a
 * genuinely dark surface.
 *
 * Not a taste value. It is the backdrop luminance at which ink and cream give
 * identical contrast, from the WCAG ratio: (L + 0.05)² = (0.048 + 0.05) ×
 * (0.887 + 0.05), so L = 0.25. Above it ink always wins, below it cream does,
 * which makes this the one threshold that never picks the worse of the two.
 */
const DEEP_LUMINANCE = 0.25

/** WCAG relative luminance, so the decision tracks perceived lightness rather
 *  than a raw channel average. */
function luminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/**
 * Every element that actually paints a full-width band, in document order,
 * tagged with whether it is pale enough to need an ink bar.
 *
 * Derived from the rendered styles rather than a hand-written list of
 * selectors: the sections do not share a tag (header, section and div all
 * appear), and a list has to be updated by hand every time a pale one is
 * added — forget, and the links sit cream-on-cream with nothing to catch it.
 *
 * Two levels deep covers the wrappers that group bands without painting
 * anything themselves (the curtain around the hero and manifesto) and the
 * opaque children that sit inside a band (the About bar).
 */
function collectBands(root) {
  const bands = []
  const pageWidth = document.documentElement.clientWidth

  const walk = (node, depth, inheritedZ) => {
    for (const child of node.children) {
      const style = getComputedStyle(child)
      // Only the outermost band's z-index decides paint order between
      // siblings; anything nested inside one is ordered by the walk itself.
      const z =
        depth === 0
          ? style.zIndex === 'auto'
            ? 0
            : Number(style.zIndex)
          : inheritedZ

      const parts = style.backgroundColor.match(/[\d.]+/g)
      if (parts) {
        const alpha = parts[3] === undefined ? 1 : Number(parts[3])
        // Transparent fills let whatever is behind them show through, and a
        // narrow element is a component rather than a band.
        if (
          alpha > 0.5 &&
          child.getBoundingClientRect().width > pageWidth * 0.9
        ) {
          // Stored as the measured value rather than a verdict: the links and
          // the wordmark judge it against different thresholds.
          bands.push({
            node: child,
            z,
            lum: luminance(parts.slice(0, 3).map(Number)),
          })
        }
      }
      if (depth < 2) walk(child, depth + 1, z)
    }
  }

  walk(root, 0, 0)

  // Painting order, back to front. The walk already emits document order, and
  // a stable sort keeps it within each z-index — so this only reorders the
  // siblings that actually lift themselves, like the marquee (z-index 5)
  // riding over the projects section (z-index 2) it overlaps.
  bands.sort((a, b) => a.z - b.z)
  return bands
}

// "Imem" (Amoria) and "Ayachi" (Anton) are naturally different widths at the
// same font-size. Stretch the narrower line to match the wider one so both
// lines fill an identical box — same start, same end.
function Logo() {
  const topRef = useRef(null)
  const bottomRef = useRef(null)

  useLayoutEffect(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return

    const measure = () => {
      top.style.transform = 'none'
      bottom.style.transform = 'none'
      const topWidth = top.getBoundingClientRect().width
      const bottomWidth = bottom.getBoundingClientRect().width
      const maxWidth = Math.max(topWidth, bottomWidth)
      if (topWidth > 0) top.style.transform = `scaleX(${maxWidth / topWidth})`
      if (bottomWidth > 0) bottom.style.transform = `scaleX(${maxWidth / bottomWidth})`
    }

    measure()
    // Re-measure once the real (non-fallback) fonts have finished loading.
    document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <div className="site-nav__logo">
      <span ref={topRef} className="site-nav__logo-line site-nav__logo-line--top">
        Imem
      </span>
      <span
        ref={bottomRef}
        className="site-nav__logo-line site-nav__logo-line--bottom"
      >
        Ayachi
      </span>
    </div>
  )
}

export default function SiteNav({ visible }) {
  const navRef = useRef(null)

  // The bar is fixed over sections of different colours, so it has to invert
  // as a light-backgrounded one slides underneath it. Toggling a class off a
  // rAF-throttled scroll read keeps this out of React's render path.
  useEffect(() => {
    const el = navRef.current
    if (!el) return

    // Resolved on the first scroll tick rather than at mount, so the styles
    // it reads are the real ones and not a pre-stylesheet snapshot.
    let bands = null

    return onScroll(() => {
      const site = document.querySelector('main.site')
      if (!site) return
      if (!bands || !bands.length) bands = collectBands(site)

      const navBottom = el.getBoundingClientRect().bottom
      // The last overlapping band in painting order is the one on top, which
      // is what the bar is actually sitting against — this is what keeps the
      // links cream over the dark About bar even though the pale section it
      // belongs to also spans that line.
      // Default to the cream page ground when nothing is under the bar yet.
      let backdrop = 1
      for (const band of bands) {
        const rect = band.node.getBoundingClientRect()
        if (rect.top <= navBottom && rect.bottom >= navBottom) {
          backdrop = band.lum
        }
      }

      el.classList.toggle('is-on-light', backdrop > LIGHT_LUMINANCE)
      el.classList.toggle('is-on-deep', backdrop < DEEP_LUMINANCE)
    })
  }, [])

  return (
    <header
      className={`site-nav ${visible ? 'is-visible' : ''}`}
      ref={navRef}
    >
      <Logo />
      <nav>
        <ul className="site-nav__links">
          {NAV_LINKS.map((label, i) => (
            <li key={label} className={i === 0 ? 'is-active' : ''}>
              {/* aria-label keeps the link's accessible name stable while
                  the visible text is mid-decode. */}
              <a href={`#${label.toLowerCase()}`} aria-label={label} data-magnetic>
                <ScrambleText text={label} />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <a
        className="site-nav__contact"
        href="#contact"
        aria-label="Contact"
        data-magnetic
        data-cursor="Say hello"
      >
        <ScrambleText text="Contact" />
      </a>
    </header>
  )
}
