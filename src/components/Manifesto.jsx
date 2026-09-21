import { useEffect, useMemo, useRef } from 'react'
import { onScroll, viewportProgress } from '../lib/scroll'
import './Manifesto.css'

const HEADLINE = ['I build', 'products', 'that feel', 'inevitable.']

// Each line drifts sideways at its own rate as the section travels through
// the viewport, so the block breathes instead of moving as one slab.
const LINE_DRIFT = [34, -22, 26, -16]

const BODY = [
  "I'm a fullstack developer focused on crafting digital products that are useful, intuitive, and built to scale.",
  'From clean interfaces to robust backend systems, I care about the details that make products feel seamless.',
]

const CAPABILITIES = [
  ['Frontend', 'Backend', 'Cloud'],
  ['Design Systems', 'Performance'],
  ['Developer Experience'],
]

// Scroll window over which the body copy lights up, word by word. It closes
// while the paragraph is still comfortably in view — the copy is fully lit
// around the point it sits centred, well before it leaves the screen.
const LIT_START = 0.13
const LIT_END = 0.4

export default function Manifesto() {
  const sectionRef = useRef(null)
  const bodyRef = useRef(null)

  // Flatten the copy to words once, keeping a running index so the
  // illumination can sweep continuously across both paragraphs.
  const paragraphs = useMemo(() => {
    let index = 0
    return BODY.map((text) =>
      text.split(' ').map((word) => ({ word, index: index++ }))
    )
  }, [])
  const totalWords = useMemo(
    () => paragraphs.reduce((sum, p) => sum + p.length, 0),
    [paragraphs]
  )

  // One-shot entry reveal; the per-element stagger lives in CSS via --i.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('is-revealed')
            observer.disconnect()
          }
        })
      },
      { threshold: 0.05 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Continuous scroll- and pointer-linked motion, published as CSS custom
  // properties so the animation itself stays declarative and compositor-friendly.
  useEffect(() => {
    const el = sectionRef.current
    const body = bodyRef.current
    if (!el || !body) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const unsubscribe = onScroll(() => {
      const progress = viewportProgress(el)
      el.style.setProperty('--p', progress.toFixed(4))

      // Leading edge of the word-by-word illumination.
      const span = (progress - LIT_START) / (LIT_END - LIT_START)
      const active = Math.min(1, Math.max(0, span)) * totalWords
      body.style.setProperty('--active', active.toFixed(3))
    })

    const onPointerMove = (event) => {
      const rect = el.getBoundingClientRect()
      const mx = (event.clientX - rect.left) / rect.width - 0.5
      const my = (event.clientY - rect.top) / rect.height - 0.5
      el.style.setProperty('--mx', mx.toFixed(4))
      el.style.setProperty('--my', my.toFixed(4))
    }

    el.addEventListener('pointermove', onPointerMove)

    return () => {
      unsubscribe()
      el.removeEventListener('pointermove', onPointerMove)
    }
  }, [totalWords])

  return (
    <section className="mf" ref={sectionRef} id="about">
      <span className="mf__progress" aria-hidden="true">
        <span className="mf__progress-bar" />
      </span>

      <div className="mf__inner">
        <div className="mf__headline-col">
          <h2 className="mf__headline">
            {HEADLINE.map((line, lineIndex) => (
              <span
                key={line}
                className="mf__line"
                style={{ '--i': lineIndex, '--drift': LINE_DRIFT[lineIndex] }}
              >
                {/* Characters rise individually inside the line's mask. */}
                {line.split('').map((char, charIndex) => (
                  <span
                    key={charIndex}
                    className="mf__char"
                    style={{ '--c': charIndex }}
                  >
                    {char === ' ' ? ' ' : char}
                  </span>
                ))}
              </span>
            ))}
          </h2>

          <span className="mf__signature" style={{ '--i': HEADLINE.length }}>
            Imem Ayachi.
          </span>
        </div>

        <div className="mf__body-col" ref={bodyRef}>
          {paragraphs.map((words, i) => (
            <p key={i} className="mf__paragraph">
              {words.map(({ word, index }) => (
                <span key={index} className="mf__word" style={{ '--w': index }}>
                  {word}{' '}
                </span>
              ))}
            </p>
          ))}

          <span className="mf__rule" style={{ '--i': 4 }} aria-hidden="true" />

          <ul className="mf__capabilities">
            {CAPABILITIES.map((row, rowIndex) => (
              <li
                key={rowIndex}
                className="mf__cap-row"
                style={{ '--i': rowIndex + 5 }}
              >
                {row.map((item, itemIndex) => (
                  <span key={item} className="mf__cap">
                    {item}
                    {itemIndex < row.length - 1 && (
                      <span className="mf__cap-dot" aria-hidden="true">
                        ·
                      </span>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The loader's sparkle again, filling the gap between the columns:
          spins with scroll, leans toward the cursor, blooms on hover. */}
      <div className="mf__mark">
        <svg viewBox="0 0 180.2 180.2" aria-hidden="true">
          <path d="M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z" />
        </svg>
      </div>

    </section>
  )
}
