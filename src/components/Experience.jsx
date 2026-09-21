import { useEffect, useRef, useState } from 'react'
import { onScroll, viewportProgress } from '../lib/scroll'
import ScrambleText from './ScrambleText'
import './Experience.css'

// Placeholder history — swap the years, roles and blurbs for your own.
const ENTRIES = [
  {
    year: '2025',
    role: 'Fullstack Developer',
    org: 'Menute',
    blurb:
      'Built a menu and orders platform end-to-end — realtime dashboards, role-based access and an analytics layer restaurants actually read.',
    tags: ['React', 'Node.js', 'PostgreSQL'],
  },
  {
    year: '2024',
    role: 'Fullstack Developer',
    org: 'Ecomeasy',
    blurb:
      'Shipped a storefront builder with payments, product management and a themeable checkout that merchants configure without touching code.',
    tags: ['Next.js', 'MongoDB', 'Stripe'],
  },
  {
    year: '2023',
    role: 'Backend Developer',
    org: 'SkillSet',
    blurb:
      'Designed the REST API and data model behind an internship platform, then took the mobile client from first screen to store release.',
    tags: ['Express', 'React Native', 'Socket.IO'],
  },
  {
    year: '2022',
    role: 'Foundations',
    org: 'Independent',
    blurb:
      'Learned the craft in the open — small tools, open source contributions, and a habit of shipping something every week.',
    tags: ['JavaScript', 'Git', 'Linux'],
  },
]

export default function Experience() {
  const sectionRef = useRef(null)
  const listRef = useRef(null)
  const [active, setActive] = useState(0)
  const [revealed, setRevealed] = useState(() => new Set())

  // Reveal each entry as it arrives, rather than all at once with the section.
  // Held in state rather than toggled with classList: this component
  // re-renders whenever the active entry changes, and React rewrites
  // className on every render — which would strip an imperative class.
  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const items = Array.from(list.querySelectorAll('.xp__item'))
    const observer = new IntersectionObserver(
      (entries) => {
        const arrived = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => {
            observer.unobserve(entry.target)
            return Number(entry.target.dataset.index)
          })
        if (!arrived.length) return
        setRevealed((prev) => {
          const next = new Set(prev)
          arrived.forEach((i) => next.add(i))
          return next
        })
      },
      { threshold: 0.35 }
    )

    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  // Rail progress, plus which entry currently sits nearest the middle of
  // the screen — that one reads as "active".
  useEffect(() => {
    const section = sectionRef.current
    const list = listRef.current
    if (!section || !list) return

    return onScroll(() => {
      section.style.setProperty('--p', viewportProgress(section).toFixed(4))

      const middle = window.innerHeight / 2
      let nearest = 0
      let best = Infinity
      list.querySelectorAll('.xp__item').forEach((item, i) => {
        const r = item.getBoundingClientRect()
        const distance = Math.abs(r.top + r.height / 2 - middle)
        if (distance < best) {
          best = distance
          nearest = i
        }
      })
      setActive((prev) => (prev === nearest ? prev : nearest))
    })
  }, [])

  return (
    <section className="xp" ref={sectionRef} id="career">
      <span className="margin-label" aria-hidden="true">
        Where I&rsquo;ve been
      </span>

      <div className="xp__inner">
        <div className="xp__aside">
          <h2 className="xp__title" aria-label="Experience">
            <ScrambleText text="Experience" />
          </h2>
          <p className="xp__lede">
            Four years of building, shipping and maintaining products people
            use every day.
          </p>
          <span className="xp__counter">
            <b>{String(active + 1).padStart(2, '0')}</b>
            <i>/</i>
            {String(ENTRIES.length).padStart(2, '0')}
          </span>
        </div>

        <ol className="xp__list" ref={listRef}>
          <span className="xp__rail" aria-hidden="true">
            <span className="xp__rail-fill" />
          </span>

          {ENTRIES.map((entry, i) => (
            <li
              key={entry.year}
              data-index={i}
              className={`xp__item ${i === active ? 'is-active' : ''} ${
                revealed.has(i) ? 'is-in' : ''
              }`}
              style={{ '--i': i }}
            >
              <span className="xp__marker" aria-hidden="true" />
              <span className="xp__year">{entry.year}</span>
              <div className="xp__body">
                <h3 className="xp__role">
                  {entry.role}
                  <span className="xp__org">{entry.org}</span>
                </h3>
                <p className="xp__blurb">{entry.blurb}</p>
                <ul className="xp__tags">
                  {entry.tags.map((tag) => (
                    <li key={tag}>[ {tag} ]</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
