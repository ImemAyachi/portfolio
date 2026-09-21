import { useEffect, useState } from 'react'
import { initScroll, destroyScroll, onScroll } from './lib/scroll'
import { initMagnetic } from './lib/magnetic'
import Loader from './components/Loader'
import SiteNav from './components/SiteNav'
import Hero from './components/Hero'
import Manifesto from './components/Manifesto'
import About from './components/About'
import Marquee from './components/Marquee'
import Projects from './components/Projects'
import Gallery from './components/Gallery'
import Experience from './components/Experience'
import Contact from './components/Contact'
import SparkleCursor from './components/SparkleCursor'
import './App.css'

function App() {
  const [siteVisible, setSiteVisible] = useState(false)

  // One scroll source drives every section; start it before they mount so
  // their subscriptions have something to attach to.
  useEffect(() => {
    initScroll()

    // Scroll velocity, as a skew the big headings lean into. Written straight
    // onto the handful of target elements rather than as a custom property on
    // :root — a variable there invalidates style for the whole document on
    // every frame, which showed up as stutter.
    const targets = Array.from(
      document.querySelectorAll('.pj__title, .xp__title, .gl__title, .ct__title')
    )
    let lastSkew = null

    const unsubscribe = onScroll(({ velocity }) => {
      // Clamped hard — past a couple of degrees it reads as a glitch.
      const skew = Math.max(-2.6, Math.min(2.6, velocity * 0.22))
      // Skip redundant writes while it's essentially at rest.
      if (lastSkew !== null && Math.abs(skew - lastSkew) < 0.02) return
      lastSkew = skew
      const transform = `skewY(${skew.toFixed(2)}deg)`
      for (const el of targets) el.style.transform = transform
    })

    // One pointer listener and one rAF for every magnetic element on the
    // page, for the same reason the scroll broadcaster exists.
    const stopMagnetic = initMagnetic()

    return () => {
      unsubscribe()
      stopMagnetic()
      destroyScroll()
    }
  }, [])

  return (
    <>
      <Loader onDone={() => setSiteVisible(true)} />
      {/* Deliberately outside .site: that element animates with a transform,
          which would make it the containing block for position:fixed and
          pin the bar to the page instead of the viewport. */}
      <SiteNav visible={siteVisible} />
      {/* Outside .site for the same reason as the nav — a transformed
          ancestor would capture its position:fixed layer. */}
      <SparkleCursor />
      <main className={`site ${siteVisible ? 'site--visible' : ''}`}>
        {/* Bounds the hero's sticky range. Without this its containing block
            is .site — the whole document — so it stays pinned behind every
            later section and shows through the transparent ones. */}
        <div className="curtain">
          <Hero />
          <Manifesto />
        </div>
        <About />
        <Marquee />
        <Projects />
        <Gallery />
        <Experience />
        <Contact />
      </main>
    </>
  )
}

export default App
