import { useEffect, useRef } from 'react'
import { onScroll, isScrollLocked } from '../lib/scroll'
import './Marquee.css'

const ITEMS = [
  'React',
  'TypeScript',
  'Node',
  'PostgreSQL',
  'Design Systems',
  'Cloud',
  'Performance',
  'Accessibility',
]

// Drift speed in px/sec.
const SPEED = 46
// Time constant for easing between forward and reverse, in ms.
const TURN_TAU = 260

export default function Marquee() {
  const ref = useRef(null)
  const trackRef = useRef(null)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const group = track.querySelector('.mq__group')
    if (!group) return

    let width = group.offsetWidth
    let pos = 0
    // Eased rather than switched, so a reversal decelerates through zero
    // instead of snapping to the opposite direction.
    let dir = 1
    let targetDir = 1
    let lastFrame = performance.now()
    let raf = 0

    const onResize = () => {
      width = group.offsetWidth
    }

    // Direction comes from the shared scroll source.
    const unsubscribe = onScroll(({ direction }) => {
      if (direction) targetDir = direction
    })

    const loop = (now) => {
      const dt = Math.min(64, now - lastFrame)
      lastFrame = now

      // Idle behind an overlay: it's off-screen, and the frames are better
      // spent on the overlay's own transition.
      if (isScrollLocked()) {
        raf = requestAnimationFrame(loop)
        return
      }

      const k = 1 - Math.exp(-dt / TURN_TAU)
      dir += (targetDir - dir) * k

      if (width > 0) {
        pos += dir * SPEED * (dt / 1000)
        // Wrap into [0, width); the second copy of the group is what makes
        // the seam invisible in either direction.
        pos = ((pos % width) + width) % width
        track.style.transform = `translate3d(${-pos.toFixed(2)}px, 0, 0)`
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="mq" ref={ref} aria-hidden="true">
      <div className="mq__track" ref={trackRef}>
        {[0, 1].map((copy) => (
          <div className="mq__group" key={copy}>
            {ITEMS.map((item) => (
              <span className="mq__item" key={`${copy}-${item}`}>
                {item}
                <span className="mq__star">✳</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
