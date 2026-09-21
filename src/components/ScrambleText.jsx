import { useCallback, useEffect, useRef } from 'react'

const GLYPHS = '!<>-_\\/[]{}=+*^?#§±'

/**
 * Decodes its text on hover — each character flickers through random glyphs
 * before settling, left to right.
 *
 * The scrambling node is aria-hidden and paired with a screen-reader copy,
 * so assistive tech never reads the garbled intermediate state.
 */
export default function ScrambleText({
  text,
  className = '',
  duration = 460,
}) {
  const ref = useRef(null)
  const rafRef = useRef(0)

  const scramble = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    cancelAnimationFrame(rafRef.current)
    const chars = Array.from(text)
    // Each character gets its own settle time: a left-to-right sweep plus a
    // little jitter, so they don't resolve in a mechanical line.
    const settle = chars.map(
      (_, i) =>
        (i / Math.max(1, chars.length)) * duration * 0.55 +
        Math.random() * duration * 0.45
    )
    const start = performance.now()

    const tick = (now) => {
      const elapsed = now - start
      let settled = true
      el.textContent = chars
        .map((char, i) => {
          if (char === ' ') return ' '
          if (elapsed >= settle[i]) return char
          settled = false
          return GLYPHS[(Math.random() * GLYPHS.length) | 0]
        })
        .join('')

      if (settled) {
        el.textContent = text
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [text, duration])

  // Text can change between renders; make sure we never leave it garbled.
  useEffect(() => {
    const el = ref.current
    if (el) el.textContent = text
    return () => cancelAnimationFrame(rafRef.current)
  }, [text])

  return (
    <span className={className} onPointerEnter={scramble}>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  )
}
