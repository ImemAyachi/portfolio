import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll, unlockScroll } from '../lib/scroll'
import './CaseStudy.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const OPEN_MS = 560
const CLOSE_MS = 420
const CONTENT_MS = 380

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Clip rectangle matching the card the overlay grew from.
 *
 * The corner radius stays fixed at 8px in both keyframes — interpolating the
 * radius as well as the insets forces the clip off the fast path and is the
 * main source of stutter. At full size an 8px radius is imperceptible.
 */
function insetFromRect(rect) {
  if (!rect) return 'inset(45% 45% 45% 45% round 8px)'
  const right = Math.max(0, window.innerWidth - rect.right)
  const bottom = Math.max(0, window.innerHeight - rect.bottom)
  return `inset(${Math.max(0, rect.top)}px ${right}px ${bottom}px ${Math.max(
    0,
    rect.left
  )}px round 8px)`
}

const FULL = 'inset(0px 0px 0px 0px round 8px)'

/** Wait for a painted frame, so an animation never starts on a busy frame. */
const afterPaint = (fn) =>
  requestAnimationFrame(() => requestAnimationFrame(fn))

export default function CaseStudy({ project, originRect, onClose }) {
  const surfaceRef = useRef(null)
  const panelRef = useRef(null)
  const scrimRef = useRef(null)
  const closeRef = useRef(null)
  const returnFocusRef = useRef(null)
  const closingRef = useRef(false)
  // The body copy is a screenful of DOM. Mounting it on the click frame was
  // costing ~116ms and stalling the opening animation before it began, so it
  // is held back until the expansion is under way.
  const [showContent, setShowContent] = useState(false)

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true

    const surface = surfaceRef.current
    const panel = panelRef.current
    if (!surface || prefersReducedMotion()) {
      onClose()
      return
    }

    // Content first and fast, so the surface isn't collapsing around live
    // text — that's what made the close read as a stutter.
    panel?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: 'linear',
      fill: 'forwards',
    })
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_MS,
      easing: EASE,
      fill: 'forwards',
    })

    const animation = surface.animate(
      [{ clipPath: FULL }, { clipPath: insetFromRect(originRect) }],
      { duration: CLOSE_MS, delay: 70, easing: EASE, fill: 'forwards' }
    )
    animation.onfinish = onClose
  }, [onClose, originRect])

  useEffect(() => {
    if (!project) return

    closingRef.current = false
    returnFocusRef.current = document.activeElement
    lockScroll()
    // preventScroll matters: focusing inside a fresh scroll container would
    // otherwise scroll it and force a layout mid-animation.
    closeRef.current?.focus({ preventScroll: true })

    const surface = surfaceRef.current
    const panel = panelRef.current
    const reduced = prefersReducedMotion()

    let contentTimer = 0

    if (surface && !reduced) {
      // Hold the collapsed state until the first frame has actually painted;
      // animating on the mount frame drops the opening frames.
      surface.style.clipPath = insetFromRect(originRect)
      surface.style.willChange = 'clip-path'

      afterPaint(() => {
        const expand = surface.animate(
          [{ clipPath: insetFromRect(originRect) }, { clipPath: FULL }],
          { duration: OPEN_MS, easing: EASE, fill: 'forwards' }
        )
        // Drop the layer hint once it's done — leaving it on is its own cost.
        expand.onfinish = () => {
          surface.style.willChange = 'auto'
        }

        scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: OPEN_MS,
          easing: EASE,
          fill: 'forwards',
        })

        // Once the expansion has a clear runway, mount the body copy — it
        // fades in on its own from CSS.
        contentTimer = setTimeout(() => setShowContent(true), 170)
      })
    } else {
      setShowContent(true)
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return

      // Keep Tab inside the dialog while it's open.
      const focusable = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(contentTimer)
      setShowContent(false)
      document.removeEventListener('keydown', onKeyDown)
      unlockScroll()
      returnFocusRef.current?.focus?.({ preventScroll: true })
    }
    // originRect travels with the project; re-running on it would restart
    // the animation mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, close])

  if (!project) return null

  const titleId = `cs-title-${project.id}`

  return createPortal(
    <div className="cs" role="presentation">
      <div className="cs__scrim" ref={scrimRef} onClick={close} />

      {/* Empty coloured rectangle — this is the only thing that gets clipped,
          so each frame is a cheap fill rather than a re-raster of a full
          screen of text. */}
      <div className="cs__surface" ref={surfaceRef} />

      <div
        className="cs__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <button
          type="button"
          className="cs__close"
          onClick={close}
          ref={closeRef}
          aria-label="Close case study"
        >
          <span aria-hidden="true">Close</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M5 5l14 14M19 5L5 19"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="cs__scroll">
          {showContent && (
          <div className="cs__inner">
            <header className="cs__head">
              <span className="cs__role">{project.role}</span>
              <h2 className="cs__title" id={titleId}>
                {project.name}
              </h2>
              <p className="cs__tagline">{project.tagline}</p>
            </header>

            <div className="cs__grid">
              <div className="cs__main">
                <p className="cs__summary">{project.summary}</p>

                <section className="cs__block">
                  <h3 className="cs__label">The problem</h3>
                  <p className="cs__body">{project.problem}</p>
                </section>

                <section className="cs__block">
                  <h3 className="cs__label">What I built</h3>
                  <ul className="cs__list">
                    {project.build.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="cs__block">
                  <h3 className="cs__label">Outcome</h3>
                  <p className="cs__body">{project.outcome}</p>
                </section>
              </div>

              <aside className="cs__side">
                <section className="cs__block cs__block--first">
                  <h3 className="cs__label">Stack</h3>
                  <ul className="cs__tags">
                    {project.stack.map((tech) => (
                      <li key={tech}>[ {tech} ]</li>
                    ))}
                  </ul>
                </section>

                {project.links?.length > 0 && (
                  <section className="cs__block">
                    <h3 className="cs__label">Links</h3>
                    <nav className="cs__links" aria-label={`${project.name} links`}>
                      {project.links.map((link) => (
                        <a
                          key={link.label}
                          className="cs__link link-underline"
                          href={link.href}
                        >
                          {link.label}
                        </a>
                      ))}
                    </nav>
                  </section>
                )}
              </aside>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
