import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { onScroll, viewportProgress } from '../lib/scroll'
import { PROJECTS_BY_ID } from '../data/projects'
import CaseStudy from './CaseStudy'
import ScrambleText from './ScrambleText'
import './Projects.css'

const NAV = ['Overview', 'Menus', 'Orders', 'Clients', 'Workers', 'Analytics', 'Settings']

const STATS = [
  { label: 'Total Orders', value: '1,248', delta: '12.5% vs last week' },
  { label: 'Revenue', value: '24,780 DT', delta: '18.3% vs last week' },
  { label: 'Active Clients', value: '326', delta: '8.1% vs last week' },
  { label: 'Avg. Order Value', value: '19.8 DT', delta: '9.2% vs last week' },
]

const TOP_ITEMS = [
  ['Margherita Pizza', '342'],
  ['Cheeseburger', '276'],
  ['Caesar Salad', '198'],
  ['Chicken Wrap', '154'],
  ['Pasta Alfredo', '128'],
]

const FILE_TREE = [
  { name: 'server', type: 'folder', depth: 0 },
  { name: 'controllers', type: 'folder', depth: 1 },
  { name: 'user.controller.js', type: 'file', depth: 2, active: true },
  { name: 'auth.controller.js', type: 'file', depth: 2 },
  { name: 'models', type: 'folder', depth: 1 },
  { name: 'User.js', type: 'file', depth: 2 },
  { name: 'Order.js', type: 'file', depth: 2 },
  { name: 'routes', type: 'folder', depth: 1 },
  { name: 'user.routes.js', type: 'file', depth: 2 },
  { name: 'auth.routes.js', type: 'file', depth: 2 },
]

const ECOM_TAGS = ['Next.js', 'Node.js', 'MongoDB', 'TailwindCSS', 'Stripe']

// The editor mockup's source, as [tokenClass, text] pairs — an empty class
// means plain text. Keeps the syntax colouring data-driven instead of
// wrapping every fragment in bespoke markup.
const CODE_LINES = [
  [
    ['k', 'const'],
    ['', ' User '],
    ['op', '='],
    ['', ' '],
    ['k', 'require'],
    ['', '('],
    ['st', "'../models/User'"],
    ['', ');'],
  ],
  [],
  [
    ['', 'exports.'],
    ['fn', 'getUser'],
    ['', ' '],
    ['op', '='],
    ['', ' '],
    ['k', 'async'],
    ['', ' (req, res) '],
    ['op', '=>'],
    ['', ' {'],
  ],
  [
    ['', '  '],
    ['k', 'try'],
    ['', ' {'],
  ],
  [
    ['', '    '],
    ['k', 'const'],
    ['', ' user '],
    ['op', '='],
    ['', ' '],
    ['k', 'await'],
    ['', ' User.'],
    ['fn', 'findById'],
    ['', '(req.params.id);'],
  ],
  [
    ['', '    '],
    ['k', 'if'],
    ['', ' ('],
    ['op', '!'],
    ['', 'user) '],
    ['k', 'return'],
    ['', ' res.'],
    ['fn', 'status'],
    ['', '('],
    ['nu', '404'],
    ['', ').'],
    ['fn', 'json'],
    ['', '({ error: '],
    ['st', "'User not found'"],
    ['', ' });'],
  ],
  [
    ['', '    res.'],
    ['fn', 'status'],
    ['', '('],
    ['nu', '200'],
    ['', ').'],
    ['fn', 'json'],
    ['', '({ success: '],
    ['nu', 'true'],
    ['', ', user });'],
  ],
  [
    ['', '  } '],
    ['k', 'catch'],
    ['', ' (err) {'],
  ],
  [
    ['', '    res.'],
    ['fn', 'status'],
    ['', '('],
    ['nu', '500'],
    ['', ').'],
    ['fn', 'json'],
    ['', '({ error: err.message });'],
  ],
  [['', '  }']],
  [['', '};']],
]

// A small line chart, drawn from plain numbers so there's no image to load.
const CHART = [28, 46, 34, 62, 48, 78, 66]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function chartPath(values, width, height) {
  const max = Math.max(...values)
  const step = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = height - (v / max) * height * 0.86 - height * 0.07
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export default function Projects() {
  const sectionRef = useRef(null)
  const gridRef = useRef(null)
  const cursorRef = useRef(null)
  // Holds the id plus the card's rect at click time, so the overlay knows
  // which rectangle to expand out of.
  const [open, setOpen] = useState(null)

  // Staggered entry reveal.
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
      { threshold: 0.08 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Scroll progress for the artwork parallax, plus how far each stacked card
  // has been covered by the one after it.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    return onScroll(() => {
      el.style.setProperty('--p', viewportProgress(el).toFixed(4))

      // A card is "covered" in proportion to how far the next one has closed
      // the gap between their tops — 0 when it's still well below, 1 once it
      // has risen level with this card.
      const cards = Array.from(el.querySelectorAll('.pj__card'))
      cards.forEach((card, i) => {
        const next = cards[i + 1]
        if (!next) {
          card.style.setProperty('--cover', '0')
          return
        }
        const span = card.offsetHeight || 1
        const delta =
          next.getBoundingClientRect().top - card.getBoundingClientRect().top
        const cover = Math.min(1, Math.max(0, 1 - delta / span))
        card.style.setProperty('--cover', cover.toFixed(3))
      })
    })
  }, [])

  // Custom "View Project" cursor. It tracks the pointer exactly rather than
  // easing toward it — any smoothing shows up as the dot lagging behind the
  // real cursor while you move. rAF only throttles the writes to one a frame.
  useEffect(() => {
    const grid = gridRef.current
    const cursor = cursorRef.current
    if (!grid || !cursor) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    const target = { x: 0, y: 0 }
    let raf = 0

    const render = () => {
      raf = 0
      // Places the element's origin on the pointer; CSS margins pull it back
      // by half the dot so the dot — not the dot-plus-label — is centred.
      cursor.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render)
    }

    const onMove = (event) => {
      target.x = event.clientX
      target.y = event.clientY
      schedule()

      const card = event.target.closest('.pj__card')
      // Each card declares whether it's a dark or light surface, so the
      // cursor can invert against it — cheaper and steadier than sampling
      // pixels, and it can't be fooled by the artwork inside a card.
      cursor.classList.toggle('is-bg-dark', card?.dataset.tone === 'dark')

      if (card) {
        const r = card.getBoundingClientRect()
        card.style.setProperty('--tx', ((event.clientX - r.left) / r.width - 0.5).toFixed(3))
        card.style.setProperty('--ty', ((event.clientY - r.top) / r.height - 0.5).toFixed(3))
      }
    }

    const onDown = () => {
      cursor.classList.add('is-pressed')
      const ring = cursor.querySelector('.pj__cursor-ring')
      if (!ring) return
      // Restart the burst even if one is mid-flight.
      ring.classList.remove('is-burst')
      void ring.offsetWidth
      ring.classList.add('is-burst')
    }

    const onUp = () => cursor.classList.remove('is-pressed')

    const onEnter = (event) => {
      cursor.classList.add('is-active')
      // Lets the sparkle cursor stand down while this one is in charge.
      document.body.classList.add('has-custom-cursor')
      // Place it before it fades in, so it never appears at a stale spot.
      target.x = event.clientX
      target.y = event.clientY
      render()
    }

    const onLeave = () => {
      cursor.classList.remove('is-active')
      cursor.classList.remove('is-pressed')
      cursor.classList.remove('is-bg-dark')
      document.body.classList.remove('has-custom-cursor')
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      grid.querySelectorAll('.pj__card').forEach((card) => {
        card.style.setProperty('--tx', 0)
        card.style.setProperty('--ty', 0)
      })
    }

    grid.addEventListener('pointermove', onMove)
    grid.addEventListener('pointerenter', onEnter)
    grid.addEventListener('pointerleave', onLeave)
    grid.addEventListener('pointerdown', onDown)
    // On window, so releasing outside the grid still clears the pressed state.
    window.addEventListener('pointerup', onUp)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.body.classList.remove('has-custom-cursor')
      grid.removeEventListener('pointermove', onMove)
      grid.removeEventListener('pointerenter', onEnter)
      grid.removeEventListener('pointerleave', onLeave)
      grid.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <section className="pj" ref={sectionRef} id="projects">
      <span className="margin-label" aria-hidden="true">
        Selected work
      </span>

      <div className="pj__top">
        <a className="pj__all link-underline" href="#projects">
          [ <span>View All Projects</span> ]
        </a>
      </div>

      <div className="pj__intro">
        <h2 className="pj__title" aria-label="Projects">
          <ScrambleText text="Projects" />
        </h2>
        <p className="pj__lede">
          A selection of products I&rsquo;ve built end-to-end. Each one solves a
          real problem and delivers real value.
        </p>
      </div>

      <div className="pj__grid" ref={gridRef}>
        {/* ---- Menute ---- */}
        <article
          className="pj__card pj__card--menute"
          data-tone="dark"
          style={{ '--i': 0 }}
        >
          {/* Direct child of the card so the card is its containing block and
              inset:0 covers the whole thing. The single focusable element
              for the card, named by aria-label. */}
          <button
            type="button"
            className="pj__open"
            aria-label="View the Menute case study"
            onClick={(e) => setOpen({ id: 'menute', rect: e.currentTarget.getBoundingClientRect() })}
          />
          <div className="pj__art" aria-hidden="true">
            <div className="mn">
              <aside className="mn__side">
                <span className="mn__brand">
                  <span className="mn__dot" /> Menute
                </span>
                <ul className="mn__nav">
                  {NAV.map((item, i) => (
                    <li key={item} className={i === 0 ? 'is-active' : ''}>
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="mn__logout">Log out</span>
              </aside>

              <div className="mn__main">
                <div className="mn__bar">
                  <span className="mn__search">Search anything...</span>
                  <span className="mn__user">
                    <span className="mn__avatar" />
                  </span>
                </div>
                <h4 className="mn__h">Overview</h4>

                <div className="mn__stats">
                  {STATS.map((s) => (
                    <div className="mn__stat" key={s.label}>
                      <span className="mn__stat-label">{s.label}</span>
                      <strong className="mn__stat-value">{s.value}</strong>
                      <span className="mn__stat-delta">▲ {s.delta}</span>
                    </div>
                  ))}
                </div>

                <div className="mn__panels">
                  <div className="mn__panel">
                    <div className="mn__panel-head">
                      <span>Orders Overview</span>
                      <span className="mn__chip">This Week</span>
                    </div>
                    <svg className="mn__chart" viewBox="0 0 260 90" preserveAspectRatio="none">
                      <path d={chartPath(CHART, 260, 90)} fill="none" strokeWidth="2" />
                    </svg>
                    <div className="mn__days">
                      {DAYS.map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mn__panel">
                    <div className="mn__panel-head">
                      <span>Top Menu Items</span>
                    </div>
                    <ul className="mn__list">
                      {TOP_ITEMS.map(([name, count]) => (
                        <li key={name}>
                          <span>{name}</span>
                          <span>{count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pj__meta pj__meta--over">
            <h3 className="pj__name">Menute</h3>
            <p className="pj__desc">Smart menu &amp; orders management platform.</p>
          </div>
        </article>

        {/* ---- Ecomeasy ---- */}
        <article
          className="pj__card pj__card--ecom"
          data-tone="light"
          style={{ '--i': 1 }}
        >
          <button
            type="button"
            className="pj__open"
            aria-label="View the Ecomeasy case study"
            onClick={(e) => setOpen({ id: 'ecomeasy', rect: e.currentTarget.getBoundingClientRect() })}
          />
          <div className="pj__art" aria-hidden="true">
            <div className="ec">
              <div className="ec__browser">
                <div className="ec__chrome">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="ec__page">
                  <div className="ec__nav">
                    <span className="ec__logo">Ecomeasy</span>
                    <span className="ec__links">
                      <i>Features</i>
                      <i>Pricing</i>
                      <i>Examples</i>
                      <i>Resources</i>
                    </span>
                    <span className="ec__cta">Start free trial</span>
                  </div>
                  <div className="ec__hero">
                    <div className="ec__copy">
                      <h5>
                        Launch your store.
                        <em>Scale your brand.</em>
                      </h5>
                      <p>
                        The all-in-one platform for digital entrepreneurs in the
                        Middle East.
                      </p>
                      <span className="ec__btn">Start free trial</span>
                    </div>
                    <div className="ec__shots">
                      <div className="ec__panel" />
                      <div className="ec__phone" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pj__meta pj__meta--card">
            <h3 className="pj__name pj__name--dark">Ecomeasy</h3>
            <p className="pj__desc pj__desc--dark">
              The all-in-one platform to launch and grow your online store.
            </p>
            <ul className="pj__tags">
              {ECOM_TAGS.map((tag) => (
                <li key={tag}>[ {tag} ]</li>
              ))}
            </ul>
          </div>
        </article>

        {/* ---- SkillSet API ---- */}
        <article
          className="pj__card pj__card--api"
          data-tone="dark"
          style={{ '--i': 2 }}
        >
          <button
            type="button"
            className="pj__open"
            aria-label="View the SkillSet API case study"
            onClick={(e) => setOpen({ id: 'skillset-api', rect: e.currentTarget.getBoundingClientRect() })}
          />
          <div className="pj__art" aria-hidden="true">
            <div className="ed">
              <aside className="ed__rail">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={i === 1 ? 'is-active' : ''} />
                ))}
              </aside>
              <aside className="ed__tree">
                <span className="ed__tree-head">Explorer</span>
                <ul>
                  {FILE_TREE.map((node) => (
                    <li
                      key={node.name}
                      className={`ed__node ed__node--${node.type} ${
                        node.active ? 'is-active' : ''
                      }`}
                      style={{ '--d': node.depth }}
                    >
                      {node.type === 'file' && <i className="ed__js">JS</i>}
                      {node.name}
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="ed__main">
                <div className="ed__tabs">
                  <span className="ed__tab is-active">
                    <i className="ed__js">JS</i> user.controller.js
                    <b>×</b>
                  </span>
                </div>
                <div className="ed__crumbs">
                  controllers <i>›</i> user.controller.js <i>›</i> getUser
                </div>
                <pre className="ed__code">
                  <code>
                    {CODE_LINES.map((tokens, lineIndex) => (
                      <Fragment key={lineIndex}>
                        <span className="ln">{lineIndex + 1}</span>
                        <span className="l">
                          {tokens.map(([cls, text], tokenIndex) =>
                            cls ? (
                              <span key={tokenIndex} className={cls}>
                                {text}
                              </span>
                            ) : (
                              text
                            )
                          )}
                        </span>
                      </Fragment>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </div>

          <div className="pj__meta pj__meta--over pj__meta--row">
            <div>
              <h3 className="pj__name">SkillSet API</h3>
              <p className="pj__desc">RESTful backend powering the SkillSet platform.</p>
            </div>
            <span className="pj__stack">Node.js · Express · MongoDB</span>
          </div>
        </article>

        {/* ---- SkillSet Mobile ---- */}
        <article
          className="pj__card pj__card--mobile"
          data-tone="light"
          style={{ '--i': 3 }}
        >
          <button
            type="button"
            className="pj__open"
            aria-label="View the SkillSet Mobile case study"
            onClick={(e) => setOpen({ id: 'skillset-mobile', rect: e.currentTarget.getBoundingClientRect() })}
          />
          <div className="pj__art pj__art--right" aria-hidden="true">
            <div className="ms">
              {[
                {
                  title: 'Find the right opportunity.',
                  rows: ['Frontend Developer', 'UI/UX Designer', 'Mobile Developer', 'Backend Developer'],
                },
                {
                  title: 'Applications',
                  rows: ['Fullstack Developer', 'UI/UX Designer', 'Mobile Developer', 'Backend Developer'],
                },
                {
                  title: 'Internship Details',
                  rows: ['Backend Developer', 'About', 'Requirements', 'Apply now'],
                },
              ].map((phone, i) => (
                <div className="ms__phone" key={i} style={{ '--n': i }}>
                  <span className="ms__notch" />
                  <div className="ms__screen">
                    <span className="ms__title">{phone.title}</span>
                    <span className="ms__search" />
                    {phone.rows.map((row) => (
                      <span className="ms__row" key={row}>
                        <span className="ms__row-icon" />
                        <span className="ms__row-text">{row}</span>
                      </span>
                    ))}
                  </div>
                  <span className="ms__bar" />
                </div>
              ))}
            </div>
          </div>

          <div className="pj__meta pj__meta--left">
            <h3 className="pj__name">SkillSet Mobile</h3>
            <p className="pj__desc">
              Cross-platform app for students
              <br />
              to find and apply to internships.
            </p>
            <span className="pj__stack pj__stack--bottom">
              React Native · Expo · Socket.IO
            </span>
          </div>
        </article>
      </div>

      {/* Trails the pointer across the grid. Portalled to <body>: it is
          position:fixed, and .site carries a transform — a transformed
          ancestor becomes the containing block for fixed descendants, which
          would anchor this to the page top instead of the viewport. */}
      {createPortal(
        <div className="pj__cursor" ref={cursorRef} aria-hidden="true">
          <span className="pj__cursor-dot">
            <span className="pj__cursor-ring" />
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M5 3l14 8-6 1.6L9.4 19z" />
            </svg>
          </span>
          <span className="pj__cursor-label">[ View Project ]</span>
        </div>,
        document.body
      )}

      <CaseStudy
        project={open ? PROJECTS_BY_ID[open.id] : null}
        originRect={open?.rect}
        onClose={() => setOpen(null)}
      />
    </section>
  )
}
