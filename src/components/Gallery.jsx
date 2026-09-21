import { useEffect, useRef } from 'react'
import { onScroll } from '../lib/scroll'
import ScrambleText from './ScrambleText'
import './Gallery.css'

// Placeholder plates — swap the captions and drop real images into
// .gl__frame when you have them.
const PLATES = [
  { n: '01', title: 'Workspace', caption: 'Where most of it actually happens.' },
  { n: '02', title: 'Whiteboard', caption: 'Schemas before syntax, every time.' },
  { n: '03', title: 'Shipping', caption: 'The quiet minute before a deploy.' },
  { n: '04', title: 'Detail', caption: 'The last five percent that takes half the time.' },
  { n: '05', title: 'Team', caption: 'Reviews, pairing, arguing about naming.' },
  { n: '06', title: 'Off hours', caption: 'Reading, tinkering, starting again.' },
]

export default function Gallery() {
  const sectionRef = useRef(null)
  const trackRef = useRef(null)

  useEffect(() => {
    const section = sectionRef.current
    const track = trackRef.current
    if (!section || !track) return

    // Below the breakpoint the track is a native horizontal scroller, which
    // beats hijacking the scroll on touch. Nothing to drive here.
    const pinned = window.matchMedia('(min-width: 901px)')
    if (!pinned.matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    return onScroll(() => {
      const rect = section.getBoundingClientRect()
      // Scroll distance available while the inner panel is pinned.
      const travel = section.offsetHeight - window.innerHeight
      const scrolled = Math.min(travel, Math.max(0, -rect.top))
      const progress = travel > 0 ? scrolled / travel : 0

      const distance = Math.max(0, track.scrollWidth - window.innerWidth)
      track.style.transform = `translate3d(${(-distance * progress).toFixed(2)}px, 0, 0)`
      section.style.setProperty('--p', progress.toFixed(4))
    })
  }, [])

  return (
    <section className="gl" ref={sectionRef} id="gallery">
      <div className="gl__sticky" data-cursor="Keep scrolling">
        <div className="gl__track" ref={trackRef}>
          <div className="gl__intro">
            <h2 className="gl__title" aria-label="Gallery">
              <ScrambleText text="Gallery" />
            </h2>
            <p className="gl__lede">
              Scroll on — this one runs sideways.
            </p>
            <span className="gl__arrow" aria-hidden="true" />
          </div>

          {PLATES.map((plate) => (
            <figure className="gl__plate" key={plate.n}>
              <div className="gl__frame" aria-hidden="true">
                <svg viewBox="0 0 180.2 180.2" className="gl__mark">
                  <path d="M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z" />
                </svg>
              </div>
              <figcaption className="gl__caption">
                <span className="gl__n">{plate.n}</span>
                <span className="gl__plate-title">{plate.title}</span>
                <span className="gl__plate-text">{plate.caption}</span>
              </figcaption>
            </figure>
          ))}

          <div className="gl__end">
            <span>End of reel</span>
          </div>
        </div>
      </div>

      <span className="gl__progress" aria-hidden="true">
        <span className="gl__progress-bar" />
      </span>
    </section>
  )
}
