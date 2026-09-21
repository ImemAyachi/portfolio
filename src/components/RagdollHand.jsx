import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRagdoll, launchSpeedFor } from '../lib/ragdoll'
import { playBat, playImpact, primeAudio } from '../lib/impactAudio'
import { lockScroll, scrollTo, unlockScroll } from '../lib/scroll'

// What the hand can hit while it is loose in the section, and what each
// surface sounds like. The game clears these — the arena is empty.
const OBSTACLES = [
  ['.ab__title', 'paper'],
  ['.ab__banner', 'ink'],
  ['.ab__text', 'paper'],
  ['.ab__portrait', 'glass'],
  ['.ab__sign-row', 'paper'],
]

// Throw speed is measured across this window rather than from the last event:
// a single pointer delta is noisy, and a flick that happens to end on a slow
// frame would otherwise register as a drop.
const THROW_WINDOW_MS = 90
const MAX_THROW = 4200 // px/s
// Upward throws are capped harder than sideways ones: the top of the section
// is open so the hand can be tossed out of frame, and at the full throw speed
// it would climb about 3400px and be gone for three seconds.
const MAX_UP = 2800

// How far from home counts as displaced, with hysteresis so the buttons
// cannot flicker while the hand is settling next to its start.
const AWAY_SHOW = 40
const AWAY_HIDE = 10

// Outside the game a bat is a fixed pop, roughly 440px.
const BAT_UP = 1520
const BAT_COOLDOWN_MS = 90
// In the game the bounce is sized to whatever it takes to clear the top of
// the screen from where the hand currently is, plus some overshoot. A fixed
// power would either fail to clear the top from low down, or fling it into
// orbit when struck near the top.
const CLEAR_OVERSHOOT = 240
const MIN_RISE = 150
// Drag-compensated launches run faster than the ballistic figure, so the cap
// has to sit above them or tall arenas would quietly fall short.
const MAX_BAT = 4600

// ---- the paddle, and how the game tightens ----
const PADDLE_H = 15
const PADDLE_MIN_W = 120
const PADDLE_SPAN = 118 // the width that decays away on top of the minimum
const PADDLE_DECAY = 11 // hits for the extra width to fall by 1/e
// Never faster than about one bounce every fifth of a second, which also
// stops a single landing registering twice.
const BOUNCE_COOLDOWN_MS = 170

/**
 * Difficulty, as three gentle curves rather than one steep one.
 *
 * All three are asymptotic or capped, so the game keeps getting harder
 * without ever reaching a point where a bounce is not returnable — at ten
 * hits the paddle is still 168px wide and the hand is only drifting a little.
 */
const paddleWidth = (score) =>
  PADDLE_MIN_W + PADDLE_SPAN * Math.exp(-score / PADDLE_DECAY)

// Sideways randomness added to each bounce, so the hand stops coming
// straight back to where you are standing.
const scatterFor = (score) => Math.min(430, score * 26)

// The pop above the screen shrinks, so there is less time out of view to read
// where it will come down. Bottoms out around fifteen hits, and never so low
// that the hand fails to clear the edge — leaving view is what scores.
const overshootFor = (score) => Math.max(95, CLEAR_OVERSHOOT - score * 11)
// Backstop above the viewport. The hand is meant to leave the screen, so the
// ceiling only exists so a freak hit cannot lose it.
const ARENA_HEADROOM = 900
const DROP_HEIGHT = 120

const BOARD_KEY = 'imem:keepie-board'
const NAME_KEY = 'imem:keepie-name'
const BOARD_SIZE = 5
const NAME_MAX = 14
const ENTER_SCROLL_MS = 950

const pad = (n) => String(n).padStart(2, '0')

/**
 * The leaderboard lives in localStorage, so it is local to this browser —
 * there is no backend to post to. Every read is defensive: private windows
 * throw on access, and a hand-edited or half-written value should degrade to
 * an empty board rather than take the game down with it.
 *
 * Normalises a list of rows into a valid board.
 *
 * Applied on the way in *and* on the way out of every placement, not just
 * when reading storage. A malformed row that reaches the board renders as
 * "undefined" and — worse — poisons the sort, because comparing against NaN
 * is not an ordering, which then throws the ranking off for every later run.
 */
function sanitiseBoard(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row) => row && Number.isFinite(row.s) && row.s > 0)
    .map((row) => ({
      s: Math.floor(row.s),
      t: Number.isFinite(row.t) ? row.t : 0,
      n: typeof row.n === 'string' ? row.n.slice(0, NAME_MAX) : '',
    }))
    .sort((a, b) => b.s - a.s || a.t - b.t)
    .slice(0, BOARD_SIZE)
}

function readBoard() {
  try {
    const raw = window.localStorage.getItem(BOARD_KEY)
    return raw ? sanitiseBoard(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function readName() {
  try {
    return (window.localStorage.getItem(NAME_KEY) || '').slice(0, NAME_MAX)
  } catch {
    return ''
  }
}

function writeName(name) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* the remembered name is a convenience, not state we depend on */
  }
}

function writeBoard(board) {
  try {
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(board))
  } catch {
    /* nothing worth doing — the board is a nicety, not state we depend on */
  }
}

/** One row per player. Unnamed runs all share the anonymous slot. */
const identity = (name) => (name || '').trim().toLowerCase() || 'anon'

/**
 * Places a run on the board, one entry per player.
 *
 * A player who is already listed has their row updated rather than a second
 * one added, so a good run cannot be pushed off the board by the same person
 * playing again. A worse run leaves their existing entry alone.
 *
 * Identity is the name, not the machine: this board lives in localStorage, so
 * every row on it is from this browser already, and there is no server to
 * read an address from. The name is the only thing that distinguishes two
 * people sharing a laptop.
 *
 * Returns the new board, the rank the player now holds (0 if they missed it),
 * and whether this run is what put them there.
 */
function placeOnBoard(board, entry) {
  const clean = sanitiseBoard(board)
  // Guards against a score that is not a number at all, rather than only one
  // that is too low: `undefined <= 0` is false, so a looser test would let a
  // malformed entry straight onto the board.
  if (!entry || !Number.isFinite(entry.s) || entry.s <= 0) {
    return { board: clean, rank: 0, improved: false }
  }

  const row = {
    s: Math.floor(entry.s),
    t: Number.isFinite(entry.t) ? entry.t : Date.now(),
    n: typeof entry.n === 'string' ? entry.n.trim().slice(0, NAME_MAX) : '',
  }

  const held = clean.findIndex((other) => identity(other.n) === identity(row.n))
  if (held !== -1 && clean[held].s >= row.s) {
    // Their own better run already stands; nothing changes.
    return { board: clean, rank: held + 1, improved: false }
  }

  const others = held === -1 ? clean : clean.filter((_, i) => i !== held)
  // Ties keep the older run ahead, so a new entry has to actually beat one.
  const ranked = [...others, row]
    .sort((a, b) => b.s - a.s || a.t - b.t)
    .slice(0, BOARD_SIZE)
  const index = ranked.indexOf(row)
  return {
    board: ranked,
    rank: index === -1 ? 0 : index + 1,
    improved: index !== -1,
  }
}

// The board is five long, so a lookup beats a suffix rule.
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth']

const AGES = [
  [86400e3, 'today'],
  [604800e3, 'this week'],
  [2592000e3, 'this month'],
]

function ago(t) {
  if (!t) return ''
  const delta = Date.now() - t
  for (const [span, label] of AGES) if (delta < span) return label
  return 'earlier'
}

/**
 * The waving hand, as something you can pick up, throw, and juggle.
 *
 * The glyph stays in flow as a hidden ghost so the title row keeps its
 * layout, and the live hand is positioned absolutely over it. The simulation
 * works in section-relative coordinates, so scrolling never moves anything
 * and the obstacle rects only need recomputing when the layout changes.
 */
export default function RagdollHand({ handRef }) {
  const ghostRef = useRef(null)
  const bodyRef = useRef(null)
  const resetRef = useRef(null)
  const playRef = useRef(null)
  const radarRef = useRef(null)
  const paddleRef = useRef(null)

  const [displaced, setDisplaced] = useState(false)
  // 'toy' -> 'playing' -> 'over'
  const [phase, setPhase] = useState('toy')
  const [score, setScore] = useState(0)
  const [board, setBoard] = useState(readBoard)
  // Rank the run just finished took, 0 if it missed the board.
  const [rank, setRank] = useState(0)
  // Whether the run just finished is what earned that rank, or their own
  // earlier run already stood higher.
  const [improved, setImproved] = useState(false)
  const [name, setName] = useState(readName)
  const best = board.length ? board[0].s : 0

  // The board and the run awaiting a name are mirrored into refs, because the
  // simulation's closure has to read and write them too and it never re-runs.
  const boardRef = useRef(board)
  const pendingRef = useRef(null)
  const [pending, setPendingState] = useState(null)
  const setPending = (value) => {
    pendingRef.current = value
    setPendingState(value)
  }

  /** Commits the run awaiting a name. Passing nothing files it unnamed. */
  const commitPending = (label) => {
    const run = pendingRef.current
    if (!run) return
    const clean = (label || '').trim().slice(0, NAME_MAX)
    const placed = placeOnBoard(boardRef.current, {
      s: run.score,
      t: run.at,
      n: clean,
    })
    boardRef.current = placed.board
    setBoard(placed.board)
    setRank(placed.rank)
    setImproved(placed.improved)
    if (placed.improved) writeBoard(placed.board)
    if (clean) writeName(clean)
    setPending(null)
  }

  // Filled in by the effect below, so the buttons rendered here can drive it.
  const api = useRef({ enter() {}, exit() {}, again() {} })
  // The reverse direction: the simulation needs to bank a pending run when
  // the player leaves without answering.
  const commitRef = useRef(commitPending)
  commitRef.current = commitPending

  // Read once during the first render rather than in an effect, so there is
  // no frame where the wrong one is mounted.
  const [physics] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useLayoutEffect(() => {
    if (!physics) return
    const ghost = ghostRef.current
    const body = bodyRef.current
    if (!ghost || !body) return

    // Found from our own node rather than taken as a prop: React attaches a
    // host element's ref after its children's layout effects have already
    // run, so a section ref passed down from the parent is still null here on
    // mount, and the whole effect would quietly bail out.
    const section = body.closest('.ab')
    if (!section) return

    const glyph = ghost.getBoundingClientRect()
    // Sized against the visible glyph rather than its line box: the emoji
    // does not fill the box, so a body the full width of it stops visibly
    // short of every surface it lands on.
    const half = Math.max(14, Math.min(glyph.width, glyph.height) * 0.44)
    const engine = createRagdoll({ half })

    let disposed = false
    let toyRects = []
    let toyBounds = { left: 0, top: 0, right: 0, bottom: 0 }
    let rects = []
    let bounds = toyBounds
    let frameId = 0
    let last = 0
    let samples = []
    // True while the hand is still sitting on its mark, untouched. A parked
    // hand follows the layout; one the reader has moved stays where they left
    // it.
    let parked = true
    let mode = 'toy'
    let runScore = 0
    let lastBat = 0
    let enterTimer = 0
    // Section-relative y of the viewport top while the arena is up.
    let viewTop = 0
    // Set once the hand has climbed clear of the screen. Only a bounce made
    // after that scores — the rule is out of view, then returned before it
    // reaches the bar.
    let leftView = false
    // Paddle, in section coordinates. Tracks the pointer exactly.
    let paddle = { x: 0, y: 0, w: paddleWidth(0), vx: 0, live: false }
    let lastBounce = 0

    /**
     * Layout position within the section, walked up the offsetParent chain.
     *
     * Deliberately not getBoundingClientRect: this section animates almost
     * everything it contains with transforms — the banner slides up 24px on
     * reveal and then drifts sideways with the scroll, the title leans toward
     * the pointer — and a client rect reports all of that. Measuring the
     * transformed box means caching obstacles that are permanently offset
     * from where the layout actually put them.
     */
    const offsetWithin = (node, root) => {
      let x = 0
      let y = 0
      let el = node
      while (el && el !== root) {
        x += el.offsetLeft
        y += el.offsetTop
        el = el.offsetParent
      }
      return {
        left: x,
        top: y,
        right: x + node.offsetWidth,
        bottom: y + node.offsetHeight,
      }
    }

    const measure = () => {
      if (disposed) return null
      toyBounds = {
        left: 0,
        // Open above the section so the hand can be tossed out of frame and
        // fall back in. The ceiling sits well above the top edge and exists
        // only so a hard throw can never lose it for good.
        top: -Math.round(section.clientHeight * 0.9),
        right: section.clientWidth,
        bottom: section.clientHeight,
      }

      toyRects = OBSTACLES.flatMap(([selector, material]) => {
        const node = section.querySelector(selector)
        if (!node || node.offsetWidth < 4 || node.offsetHeight < 4) return []
        return [{ ...offsetWithin(node, section), material }]
      })

      if (mode === 'toy') {
        bounds = toyBounds
        rects = toyRects
      }

      const g = offsetWithin(ghost, section)
      return { x: (g.left + g.right) / 2, y: (g.top + g.bottom) / 2 }
    }

    const draw = () => {
      const { x, y } = engine.center
      body.style.transform =
        `translate3d(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 50%), 0)` +
        ` rotate(${engine.angle.toFixed(1)}deg)`
    }

    let home = measure()
    engine.setHome(home.x, home.y)
    engine.place(home.x, home.y)
    draw()

    /** Restarts the wave animation on the glyph, as a small cheer per hit. */
    const cheer = () => {
      const el = handRef?.current
      if (!el) return
      el.classList.remove('is-waving')
      void el.offsetWidth
      el.classList.add('is-waving')
    }

    // Tracked in a closure, not state, so the physics loop can test it every
    // frame without re-rendering; React only hears about it when it flips.
    let away = false
    const checkDisplaced = () => {
      const { x, y } = engine.center
      const d = Math.hypot(x - home.x, y - home.y)
      const next = away ? d > AWAY_HIDE : d > AWAY_SHOW
      if (next !== away) {
        away = next
        setDisplaced(next)
      }
    }

    /**
     * Watches for the hand clearing the top of the screen, and drives the
     * marker that tracks it while it is up there. Written straight to the DOM
     * rather than through state — this runs every frame.
     */
    const trackFlight = () => {
      const { x, y } = engine.center
      const above = y < viewTop
      if (above) leftView = true

      const marker = radarRef.current
      if (!marker) return
      marker.classList.toggle('is-up', above)
      if (above) {
        const base = section.getBoundingClientRect()
        marker.style.setProperty('--x', `${(base.left + x).toFixed(1)}px`)
      }
    }

    /**
     * The paddle is not a physics body — it is a test run after each step.
     *
     * Feeding a rect that teleports with the pointer into the solver would let
     * it tunnel straight through the hand, or shove it through the floor when
     * the two overlap. Instead: if the hand is falling and its underside
     * crosses the paddle's top edge while it is over the bar, it bounces.
     */
    const bounceOffPaddle = (now) => {
      if (!paddle.live || now - lastBounce < BOUNCE_COOLDOWN_MS) return false

      const c = engine.center
      const v = engine.velocity
      const reach = engine.reach
      const top = paddle.y - PADDLE_H / 2

      const falling = v.y > 40
      // The centre has to still be above the bar: once it is past, the hand
      // has been missed and should carry on down to the ground.
      const above = c.y <= top + 14
      const touching = c.y + reach >= top
      const over = Math.abs(c.x - paddle.x) <= paddle.w / 2 + reach * 0.45
      if (!falling || !above || !touching || !over) return false

      lastBounce = now

      // Enough to clear the top of the screen from here, shrinking as the
      // score climbs.
      const rise = Math.max(MIN_RISE, c.y - viewTop + overshootFor(runScore))
      const up = Math.min(MAX_BAT, launchSpeedFor(rise))

      // Struck off-centre it goes that way, and the paddle's own sideways
      // movement drags it too — so the bounce can be aimed.
      const offset = c.x - paddle.x
      const scatter = (Math.random() * 2 - 1) * scatterFor(runScore)
      const sideways = Math.max(
        -900,
        Math.min(900, offset * 6 + paddle.vx * 0.45 + scatter)
      )
      const spin = Math.max(-9, Math.min(9, offset * 0.07))

      engine.bat(up, sideways, spin)

      if (leftView) {
        leftView = false
        runScore += 1
        setScore(runScore)
        playBat(runScore)
        cheer()
        // The bar narrows as the score climbs, so this has to follow every
        // point rather than only the start of a run.
        syncPaddle()
      } else {
        playBat(0)
      }
      return true
    }

    const endRun = () => {
      if (mode !== 'playing') return
      mode = 'over'
      setPhase('over')
      // Park the paddle so it stops catching and stops covering the panel.
      paddle.live = false
      paddleRef.current?.classList.remove('is-live')
      // Probe the placement without committing: if it made the board the
      // player gets to name it first, and nothing is written until they
      // answer or leave.
      const at = Date.now()
      const probe = placeOnBoard(boardRef.current, { s: runScore, t: at, n: '' })
      if (probe.rank) {
        setPending({ score: runScore, at, rank: probe.rank })
        setRank(probe.rank)
      } else {
        setPending(null)
        setRank(0)
        setImproved(false)
      }
    }

    const onImpact = (material, strength) => {
      playImpact(material, strength)
      // Only the ground ends a run — bouncing off the walls is fair play.
      if (mode === 'playing' && material === 'floor') endRun()
    }

    const frame = (now) => {
      const dt = last ? (now - last) / 1000 : 1 / 60
      last = now
      engine.step(dt, rects, bounds, onImpact)
      if (mode === 'playing') bounceOffPaddle(now)
      draw()
      if (mode === 'toy') checkDisplaced()
      if (mode === 'playing') trackFlight()
      // Stops the loop once it has settled; a resting body costs nothing.
      if (engine.asleep) {
        // Coming to rest anywhere ends a run too, or a hand parked on a wall
        // would leave the game hanging.
        if (mode === 'playing') endRun()
        frameId = 0
        last = 0
        return
      }
      frameId = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (frameId) return
      last = 0
      frameId = requestAnimationFrame(frame)
    }

    const toLocal = (event) => {
      const base = section.getBoundingClientRect()
      return { x: event.clientX - base.left, y: event.clientY - base.top }
    }

    /**
     * The arena: the dark bar's top edge is the floor, and the ceiling sits
     * well above the viewport because leaving the screen is the whole point —
     * a point only counts if the hand goes out of view and is caught on the
     * way down.
     */
    const arenaBounds = () => {
      const banner = section.querySelector('.ab__banner')
      const base = section.getBoundingClientRect()
      const ground = banner
        ? banner.getBoundingClientRect().top - base.top
        : section.clientHeight
      // Section-relative y of the top of the viewport. Scroll is locked while
      // playing, so this stays put.
      viewTop = -base.top
      return {
        left: 0,
        top: viewTop - ARENA_HEADROOM,
        right: section.clientWidth,
        bottom: ground,
      }
    }

    const dropIn = () => {
      // Dropped in from just above the top of the screen, so the first catch
      // follows the same rule as every other one.
      leftView = true
      engine.place(section.clientWidth / 2, viewTop - DROP_HEIGHT)
      parked = false
      wake()
    }

    const enterGame = () => {
      if (mode !== 'toy') return
      mode = 'entering'
      setPhase('playing')
      // Clears the stage: the section's own copy animates away, and every
      // other section plus the nav fades out, leaving cream and the bar.
      section.classList.add('is-playing')
      document.body.classList.add('kp-on')

      const banner = section.querySelector('.ab__banner')
      if (banner) {
        const rect = banner.getBoundingClientRect()
        scrollTo(window.scrollY + rect.bottom - window.innerHeight, {
          offset: 0,
          duration: 0.9,
        })
      }

      // Wait for the scroll to land before measuring the arena — the bounds
      // are viewport-relative, and taking them mid-glide would put the floor
      // in the wrong place.
      enterTimer = window.setTimeout(() => {
        if (disposed) return
        lockScroll()
        bounds = arenaBounds()
        rects = []
        mode = 'playing'
        runScore = 0
        setScore(0)
        setRank(0)
        setImproved(false)
        setPending(null)
        setDisplaced(false)
        paddle.live = false
        paddle.vx = 0
        lastBounce = 0
        syncPaddle()
        dropIn()
      }, ENTER_SCROLL_MS)

      window.addEventListener('pointermove', onArenaMove)
    }

    const againGame = () => {
      if (mode !== 'over') return
      mode = 'playing'
      setPhase('playing')
      runScore = 0
      setScore(0)
      setRank(0)
      setImproved(false)
      setPending(null)
      lastBounce = 0
      bounds = arenaBounds()
      syncPaddle()
      dropIn()
    }

    const exitGame = () => {
      if (mode === 'toy') return
      // Bank the run first: leaving mid-game still earned whatever is on the
      // board, and dropping it silently is the worst way to lose a best.
      // Leaving without answering the name prompt files it unnamed rather
      // than throwing the score away.
      endRun()
      commitRef.current(null)
      window.clearTimeout(enterTimer)
      window.removeEventListener('pointermove', onArenaMove)
      paddle.live = false
      mode = 'toy'
      setPhase('toy')
      section.classList.remove('is-playing')
      document.body.classList.remove('kp-on')
      unlockScroll()
      const next = measure()
      if (next) {
        home = next
        engine.setHome(next.x, next.y)
      }
      bounds = toyBounds
      rects = toyRects
      parked = true
      engine.goHome()
      wake()
    }

    api.current = { enter: enterGame, exit: exitGame, again: againGame }

    const onPointerDown = (event) => {
      event.preventDefault()
      // The one place an AudioContext is allowed to start — browsers refuse
      // outside a real gesture.
      primeAudio()
      const now = performance.now()

      // In the arena the paddle does all the work; clicks do nothing there.
      if (mode !== 'toy') return

      // Loose in the section, a tap on the airborne hand bats it back up
      // rather than catching it — a hint at the game, and it stops a throw
      // being interrupted halfway by a stray click.
      if (engine.airborne && now - lastBat > BAT_COOLDOWN_MS) {
        lastBat = now
        const p = toLocal(event)
        const c = engine.center
        // Struck left of centre, it goes right — and spins the way it was hit.
        const offset = c.x - p.x
        const sideways = Math.max(-760, Math.min(760, offset * 7))
        const spin = Math.max(-8, Math.min(8, offset * 0.08))

        engine.bat(BAT_UP, sideways, spin)
        parked = false
        playBat(1)
        cheer()
        wake()
        return
      }

      const p = toLocal(event)
      engine.grab(p.x, p.y)
      parked = false
      samples = [{ ...p, t: now }]
      body.setPointerCapture(event.pointerId)
      body.classList.add('is-held')
      wake()
    }

    const onPointerMove = (event) => {
      if (!engine.held) return
      const p = toLocal(event)
      engine.drag(p.x, p.y)
      const now = performance.now()
      samples.push({ ...p, t: now })
      while (samples.length > 2 && now - samples[0].t > THROW_WINDOW_MS) {
        samples.shift()
      }
    }

    const onPointerUp = (event) => {
      if (!engine.held) return
      const first = samples[0]
      const latest = samples[samples.length - 1]
      const span = first && latest ? (latest.t - first.t) / 1000 : 0

      let vx = 0
      let vy = 0
      if (span > 0.004) {
        vx = (latest.x - first.x) / span
        vy = (latest.y - first.y) / span
        const speed = Math.hypot(vx, vy)
        if (speed > MAX_THROW) {
          vx = (vx / speed) * MAX_THROW
          vy = (vy / speed) * MAX_THROW
        }
        if (vy < -MAX_UP) vy = -MAX_UP
      }

      engine.release(vx, vy)
      body.classList.remove('is-held')
      if (body.hasPointerCapture?.(event.pointerId)) {
        body.releasePointerCapture(event.pointerId)
      }
      wake()
    }

    const sendHome = () => {
      parked = true
      engine.goHome()
      wake()
    }

    const syncPaddle = () => {
      paddle.w = paddleWidth(runScore)
      const el = paddleRef.current
      if (el) el.style.width = `${paddle.w.toFixed(0)}px`
    }

    /**
     * The paddle follows the pointer exactly — written straight to the
     * element here rather than in the physics loop, so it tracks the cursor
     * at the pointer's own rate instead of the frame's.
     */
    let lastMoveAt = 0
    const onArenaMove = (event) => {
      if (mode === 'toy') return
      const el = paddleRef.current
      if (el) {
        el.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`
        if (!paddle.live) el.classList.add('is-live')
      }

      const base = section.getBoundingClientRect()
      const x = event.clientX - base.left
      const now = performance.now()
      const span = (now - lastMoveAt) / 1000
      // Its own speed drags the hand sideways, so a bounce can be aimed by
      // sweeping rather than only by where it lands on the bar.
      if (paddle.live && span > 0.004 && span < 0.12) {
        paddle.vx = (x - paddle.x) / span
      }
      lastMoveAt = now
      paddle.x = x
      paddle.y = event.clientY - base.top
      paddle.live = true
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || mode === 'toy') return
      // While the name prompt is up, Escape declines it rather than quitting
      // outright — a second press then leaves.
      if (pendingRef.current) {
        commitRef.current(null)
        return
      }
      exitGame()
    }

    const reset = resetRef.current
    const play = playRef.current
    reset?.addEventListener('click', sendHome)
    play?.addEventListener('click', enterGame)

    body.addEventListener('pointerdown', onPointerDown)
    body.addEventListener('pointermove', onPointerMove)
    body.addEventListener('pointerup', onPointerUp)
    body.addEventListener('pointercancel', onPointerUp)
    body.addEventListener('dblclick', sendHome)
    window.addEventListener('keydown', onKeyDown)

    // The obstacle rects are cached, so anything that reflows the section has
    // to invalidate them — fonts in particular land after first paint and
    // change the title row's height, which moves the hand's mark under it.
    const reflow = () => {
      const next = measure()
      if (!next) return
      home = next
      engine.setHome(next.x, next.y)
      // Without re-placing, a hand nobody has touched is left stranded where
      // the mark used to be — about 70px off once the display faces load.
      if (parked && mode === 'toy') {
        engine.place(next.x, next.y)
        draw()
      }
    }
    const observer = new ResizeObserver(reflow)
    observer.observe(section)
    document.fonts?.ready.then(reflow)

    return () => {
      disposed = true
      window.clearTimeout(enterTimer)
      window.removeEventListener('pointermove', onArenaMove)
      cancelAnimationFrame(frameId)
      observer.disconnect()
      if (mode !== 'toy') {
        section.classList.remove('is-playing')
        document.body.classList.remove('kp-on')
        unlockScroll()
      }
      reset?.removeEventListener('click', sendHome)
      play?.removeEventListener('click', enterGame)
      body.removeEventListener('pointerdown', onPointerDown)
      body.removeEventListener('pointermove', onPointerMove)
      body.removeEventListener('pointerup', onPointerUp)
      body.removeEventListener('pointercancel', onPointerUp)
      body.removeEventListener('dblclick', sendHome)
      window.removeEventListener('keydown', onKeyDown)
    }
    // `best` is only read to seed the closure's copy; re-running on every new
    // high score would tear down the whole simulation mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physics])

  const inGame = phase !== 'toy'
  const showButtons = displaced && !inGame

  return (
    <>
      {/* The hand's mark in the layout: holds the title row open, and anchors
          the buttons to the spot the hand belongs in. */}
      <div className="ab__hand-slot">
        <span className="ab__hand-wrap" aria-hidden="true" ref={ghostRef}>
          <span
            // With physics off this ghost *is* the hand, so it takes the ref
            // that drives the wave.
            ref={physics ? undefined : handRef}
            className={`ab__hand ${physics ? 'ab__hand--ghost' : ''}`}
            onAnimationEnd={(e) => e.currentTarget.classList.remove('is-waving')}
          >
            {'\u{1F44B}'}
          </span>
        </span>

        {/* Always rendered so they can fade rather than snap, and kept out of
            the tab order while hidden. */}
        {physics && (
          <>
            <button
              type="button"
              ref={resetRef}
              className={`ab__reset ${showButtons ? 'is-shown' : ''}`}
              tabIndex={showButtons ? 0 : -1}
              aria-hidden={!showButtons}
            >
              {/* Two layers of the same artwork: a soft field that only shows
                  on hover, and the crisp dashed outline over it. The PNG is
                  used as a mask over flat colour, so the ink is set in CSS
                  rather than baked into the file. */}
              <span className="ab__reset-glow" aria-hidden="true" />
              <span className="ab__reset-shape" aria-hidden="true" />
              <span className="ab__reset-label">Put it back</span>
            </button>

            <button
              type="button"
              ref={playRef}
              className={`ab__play ${showButtons ? 'is-shown' : ''}`}
              tabIndex={showButtons ? 0 : -1}
              aria-hidden={!showButtons}
            >
              <span className="ab__play-ball" aria-hidden="true" />
              <span className="ab__play-text">Keepie-uppie</span>
              {best > 0 && <span className="ab__play-best">{pad(best)}</span>}
            </button>
          </>
        )}
      </div>

      {physics && (
        <div
          className="ab__rag"
          ref={bodyRef}
          aria-hidden="true"
          title="Pick me up"
          data-cursor="Pick me up"
        >
          <span
            ref={handRef}
            className="ab__hand"
            // Cleared as soon as it finishes so the next hit can restart it.
            onAnimationEnd={(e) => e.currentTarget.classList.remove('is-waving')}
          >
            {'\u{1F44B}'}
          </span>
        </div>
      )}

      {/* Portalled to the body: the overlay is viewport-fixed, and .site
          carries a transform during its reveal, which would capture a fixed
          descendant and pin it to the page instead. */}
      {inGame &&
        createPortal(
          <>
            <div className="kp">
              <div className="kp__hud">
                <span className="kp__score">{pad(score)}</span>
                {best > 0 && <span className="kp__best">Best {pad(best)}</span>}
              </div>

              <button
                type="button"
                className="kp__exit"
                onClick={() => api.current.exit()}
              >
                Exit
              </button>

              {/* Tracks the hand along the top edge while it is above the
                  screen, so the catch is timing rather than guesswork. */}
              <span className="kp__radar" ref={radarRef} aria-hidden="true" />

              {/* Follows the pointer exactly; the hand bounces off it. */}
              <span className="kp__paddle" ref={paddleRef} aria-hidden="true" />

              {phase === 'playing' && score === 0 && (
                <p className="kp__hint">
                  Bounce it off the bar — off the top of the screen and back,
                  without letting it reach the ground
                </p>
              )}

              {phase === 'over' && (
                <div className="kp__over">
                  <p className="kp__over-score">{pad(score)}</p>
                  <p className="kp__over-label">
                    {/* While the prompt is up the placement is not settled —
                        the name decides it — so it cannot claim a rank yet. */}
                    {pending
                      ? 'Made the board'
                      : !rank
                        ? score > 0
                          ? 'Off the board'
                          : 'No contact'
                        : !improved
                          ? `Your ${pad(board[rank - 1]?.s ?? 0)} still stands`
                          : rank === 1
                            ? 'New best'
                            : `${ORDINALS[rank]} on the board`}
                  </p>

                  {pending ? (
                    <form
                      className="kp__name"
                      onSubmit={(event) => {
                        event.preventDefault()
                        commitPending(name)
                      }}
                    >
                      <label className="kp__name-label" htmlFor="kp-name">
                        Put a name to it
                      </label>
                      <input
                        id="kp-name"
                        className="kp__name-input"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={NAME_MAX}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        placeholder="Anon"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <div className="kp__over-actions">
                        <button type="submit">Save</button>
                        <button
                          type="button"
                          className="kp__ghost"
                          onClick={() => commitPending('')}
                        >
                          Skip
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {board.length > 0 && (
                        <ol className="kp__board">
                          {board.map((row, i) => (
                            <li
                              key={`${row.s}-${row.t}`}
                              className={i + 1 === rank ? 'is-new' : ''}
                            >
                              <span className="kp__board-rank">
                                {pad(i + 1)}
                              </span>
                              <span className="kp__board-score">
                                {pad(row.s)}
                              </span>
                              <span className="kp__board-name">
                                {row.n || 'Anon'}
                              </span>
                              <span className="kp__board-when">
                                {ago(row.t)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}

                      <div className="kp__over-actions">
                        <button
                          type="button"
                          onClick={() => api.current.again()}
                        >
                          Play again
                        </button>
                        <button
                          type="button"
                          className="kp__ghost"
                          onClick={() => api.current.exit()}
                        >
                          Done
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}
