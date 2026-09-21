/**
 * A rigid three-point verlet body.
 *
 * Three points rather than two: a two-point body is a line segment, and a
 * line has no resistance to rotating about its own axis, so it always
 * collapses into hanging straight down or lying flat. A triangle held by
 * three distance constraints behaves like a real 2D rigid body — it carries
 * rotational inertia, tumbles when thrown, and can come to rest on an edge
 * rather than snapping to one of two poses.
 *
 * Everything works in the coordinate space of whatever box is passed as
 * `bounds`, so the caller can use section-relative pixels and never has to
 * re-map anything as the page scrolls.
 */

// Exported so callers can work out the launch speed a given height needs.
export const GRAVITY = 2600 // px/s^2
const AIR = 0.9955 // share of velocity kept per step (~0.58 per second)
const RESTITUTION = 0.4 // bounce along the contact normal
// Share of sliding velocity kept per contact step. Applied at 120Hz, so this
// has to be close to 1 — anything much lower reads as landing in glue.
const TANGENT_KEEP = 0.985
const CONSTRAINT_ITERS = 10
// Two resolution passes: with three contact points a single pass can push one
// vertex out of a surface while a constraint pulls another back in.
const COLLIDE_PASSES = 2

// A fixed step keeps the simulation identical at any refresh rate; the cap
// stops a backgrounded tab from integrating one enormous jump on return.
const FIXED_DT = 1 / 120
const MAX_STEP = 0.05

// Below this approach speed a contact is treated as resting rather than
// bouncing. Gravity hands the body ~22px/s of new normal velocity every step,
// so without this it micro-bounces forever and never gets to sleep.
const REST_SPEED = 100
// And below this a contact holds instead of creeping along the surface.
const STATIC_SPEED = 20

const SLEEP_SPEED = 7 // px/s under which the body counts as still
const SLEEP_FRAMES = 40

const IMPACT_MIN = 80 // px/s — below this a contact is silent
const IMPACT_FULL = 1800 // px/s that counts as a full-strength hit

// Steps clear of every surface before the body counts as airborne. A couple of
// frames of slack, so grazing a wall mid-flight does not read as landing.
const AIRBORNE_STEPS = 8

const rad = (deg) => (deg * Math.PI) / 180

/**
 * The upward speed, in px/s, needed to rise `rise` pixels.
 *
 * Not sqrt(2gh): that assumes a vacuum, and this simulation bleeds velocity
 * every step. At these speeds the drag costs about a fifth of the height,
 * which is the difference between clearing the top of the screen and grazing
 * it. Rather than solve the damped trajectory in closed form, this runs the
 * real integrator and bisects for the launch speed that reaches the target —
 * so it stays correct if the constants above are ever retuned.
 */
export function launchSpeedFor(rise) {
  const g = GRAVITY * FIXED_DT * FIXED_DT

  const riseFrom = (perStep) => {
    let u = perStep
    let height = 0
    for (let i = 0; i < 4000 && u > 0; i++) {
      height += u
      u = u * AIR - g
    }
    return height
  }

  let lo = 0
  let hi = 90 // px per step, far past anything reachable
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2
    if (riseFrom(mid) < rise) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) / FIXED_DT
}

export function createRagdoll({ half }) {
  // Circumradius of the triangle, and the collision radius carried by each
  // vertex. Together they cover roughly the visible glyph.
  const cr = half * 0.46
  const pr = half * 0.6

  // Two vertices up, one down — a wide, slightly top-heavy body that settles
  // the way a hand shape does rather than rolling like a ball.
  const REST = [
    { x: cr * Math.cos(rad(-150)), y: cr * Math.sin(rad(-150)) },
    { x: cr * Math.cos(rad(-30)), y: cr * Math.sin(rad(-30)) },
    { x: 0, y: cr },
  ]

  const points = REST.map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y }))
  const span = (a, b) => Math.hypot(REST[a].x - REST[b].x, REST[a].y - REST[b].y)
  const links = [
    [0, 1, span(0, 1)],
    [1, 2, span(1, 2)],
    [2, 0, span(2, 0)],
  ]

  let grabbed = null
  let grabDX = 0
  let grabDY = 0
  let home = { x: 0, y: 0 }
  let homing = false
  let sleepCount = SLEEP_FRAMES
  let accumulator = 0
  let sinceContact = 0
  let touched = false

  const centroid = () => ({
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  })

  function place(cx, cy) {
    points.forEach((pt, i) => {
      pt.x = pt.px = cx + REST[i].x
      pt.y = pt.py = cy + REST[i].y
    })
    accumulator = 0
    sleepCount = SLEEP_FRAMES
    homing = false
  }

  function constrain() {
    for (const [ai, bi, len] of links) {
      const a = points[ai]
      const b = points[bi]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1e-6
      const shift = ((d - len) / d) * 0.5
      const ox = dx * shift
      const oy = dy * shift
      if (a !== grabbed) {
        a.x += ox
        a.y += oy
      }
      if (b !== grabbed) {
        b.x -= ox
        b.y -= oy
      }
    }
  }

  /** Pushes a point out of a surface and reflects its velocity across the
   *  contact normal. Verlet stores velocity as the gap between the current
   *  and previous position, so reflecting means rewriting the previous one. */
  function resolve(pt, nx, ny, depth, material, hits) {
    // Only reached when the point is actually overlapping something, so this
    // is a true contact.
    touched = true
    pt.x += nx * depth
    pt.y += ny * depth

    const vx = pt.x - pt.px
    const vy = pt.y - pt.py
    const vn = vx * nx + vy * ny

    // Only a point travelling into the surface should bounce; one already
    // moving away is just being un-overlapped.
    if (vn < 0) {
      const approach = Math.abs(vn) / FIXED_DT

      let tx = (vx - vn * nx) * TANGENT_KEEP
      let ty = (vy - vn * ny) * TANGENT_KEEP
      if (Math.hypot(tx, ty) / FIXED_DT < STATIC_SPEED) {
        tx = 0
        ty = 0
      }

      // A resting contact absorbs the normal component outright rather than
      // returning a fraction of it.
      const bounce = approach < REST_SPEED ? 0 : -vn * RESTITUTION
      pt.px = pt.x - (tx + bounce * nx)
      pt.py = pt.y - (ty + bounce * ny)

      if (approach > IMPACT_MIN && hits) {
        hits.push({ material, strength: Math.min(1, approach / IMPACT_FULL) })
      }
    } else {
      pt.px = pt.x - vx
      pt.py = pt.y - vy
    }
  }

  function collide(pt, rects, bounds, hits) {
    if (pt.x < bounds.left + pr) {
      resolve(pt, 1, 0, bounds.left + pr - pt.x, 'wall', hits)
    }
    if (pt.x > bounds.right - pr) {
      resolve(pt, -1, 0, pt.x - (bounds.right - pr), 'wall', hits)
    }
    if (pt.y < bounds.top + pr) {
      resolve(pt, 0, 1, bounds.top + pr - pt.y, 'wall', hits)
    }
    if (pt.y > bounds.bottom - pr) {
      resolve(pt, 0, -1, pt.y - (bounds.bottom - pr), 'floor', hits)
    }

    for (const r of rects) {
      // Nearest point on the rect to the circle's centre.
      const cx = Math.max(r.left, Math.min(pt.x, r.right))
      const cy = Math.max(r.top, Math.min(pt.y, r.bottom))
      const dx = pt.x - cx
      const dy = pt.y - cy
      const d2 = dx * dx + dy * dy
      if (d2 > pr * pr) continue

      if (d2 > 1e-9) {
        const d = Math.sqrt(d2)
        resolve(pt, dx / d, dy / d, pr - d, r.material, hits)
      } else {
        // Centre is inside the rect — leave by the nearest face.
        const toL = pt.x - r.left
        const toR = r.right - pt.x
        const toT = pt.y - r.top
        const toB = r.bottom - pt.y
        const least = Math.min(toL, toR, toT, toB)
        if (least === toL) resolve(pt, -1, 0, toL + pr, r.material, hits)
        else if (least === toR) resolve(pt, 1, 0, toR + pr, r.material, hits)
        else if (least === toT) resolve(pt, 0, -1, toT + pr, r.material, hits)
        else resolve(pt, 0, 1, toB + pr, r.material, hits)
      }
    }
  }

  function integrate() {
    const g = GRAVITY * FIXED_DT * FIXED_DT
    for (const pt of points) {
      // The held point is kinematic: the pointer owns it outright.
      if (pt === grabbed) continue
      const vx = (pt.x - pt.px) * AIR
      const vy = (pt.y - pt.py) * AIR
      pt.px = pt.x
      pt.py = pt.y
      pt.x += vx
      pt.y += vy + g
    }
  }

  /** A scripted return rather than a spring: pulling toward home while
   *  gravity is still running just finds the sag height where the two
   *  balance, and never actually arrives. */
  function pullHome() {
    let worst = 0
    points.forEach((pt, i) => {
      const tx = home.x + REST[i].x
      const ty = home.y + REST[i].y
      pt.x += (tx - pt.x) * 0.14
      pt.y += (ty - pt.y) * 0.14
      // Kinematic while homing — no carried velocity to fight.
      pt.px = pt.x
      pt.py = pt.y
      worst = Math.max(worst, Math.hypot(tx - pt.x, ty - pt.y))
    })
    if (worst < 0.8) place(home.x, home.y)
  }

  function simulate(rects, bounds, hits) {
    if (homing) {
      pullHome()
      return
    }
    integrate()
    for (let i = 0; i < CONSTRAINT_ITERS; i++) constrain()
    touched = false
    // Only the first pass reports impacts, so one contact is one sound.
    for (let pass = 0; pass < COLLIDE_PASSES; pass++) {
      for (const pt of points) {
        collide(pt, rects, bounds, pass === 0 ? hits : null)
      }
      if (pass < COLLIDE_PASSES - 1) constrain()
    }
    sinceContact = touched ? 0 : sinceContact + 1
  }

  return {
    place,

    setHome(x, y) {
      home = { x, y }
    },

    goHome() {
      homing = true
      grabbed = null
      sleepCount = 0
    },

    grab(x, y) {
      // Whichever vertex is nearest the pointer, so it hangs the way it was
      // picked up.
      let best = points[0]
      let bestD = Infinity
      for (const pt of points) {
        const d = Math.hypot(x - pt.x, y - pt.y)
        if (d < bestD) {
          bestD = d
          best = pt
        }
      }
      grabbed = best
      grabDX = x - best.x
      grabDY = y - best.y
      homing = false
      sleepCount = 0
    },

    drag(x, y) {
      if (!grabbed) return
      grabbed.x = x - grabDX
      grabbed.y = y - grabDY
      grabbed.px = grabbed.x
      grabbed.py = grabbed.y
      sleepCount = 0
    },

    /** vx/vy in px per second, measured by the caller from real pointer
     *  timestamps — deriving it from frame deltas makes the throw depend on
     *  how often pointer events happened to fire. */
    release(vx, vy) {
      if (!grabbed) return
      const dx = vx * FIXED_DT
      const dy = vy * FIXED_DT
      for (const pt of points) {
        if (pt === grabbed) {
          pt.px = pt.x - dx
          pt.py = pt.y - dy
        } else {
          // The free vertices keep half the swing they already had, so the
          // throw leaves the hand tumbling rather than sliding flat.
          const ex = (pt.x - pt.px) * 0.5
          const ey = (pt.y - pt.py) * 0.5
          pt.px = pt.x - (dx + ex)
          pt.py = pt.y - (dy + ey)
        }
      }
      grabbed = null
      sleepCount = 0
    },

    /**
     * Knocks the body upward, as though batted from below at `px`.
     *
     * The vertical component is set rather than added, so every hit sends it
     * to about the same height however fast it was already falling — a juggle
     * you cannot aim is not a game. The horizontal push and the spin both
     * come from where along the body it was struck.
     *
     * @param up        upward speed in px/s
     * @param sideways  horizontal push in px/s
     * @param spin      angular velocity in rad/s
     */
    bat(up, sideways, spin) {
      const c = centroid()
      for (const pt of points) {
        const rx = pt.x - c.x
        const ry = pt.y - c.y
        // Keep a little of the drift it already had, so hits are not
        // completely deterministic.
        const vx = (pt.x - pt.px) * 0.3 + (sideways - ry * spin) * FIXED_DT
        const vy = (-up + rx * spin) * FIXED_DT
        pt.px = pt.x - vx
        pt.py = pt.y - vy
      }
      grabbed = null
      homing = false
      sleepCount = 0
      // Airborne immediately: it has just been knocked clear of whatever it
      // was resting on, and waiting for the next step to notice would let a
      // fast follow-up tap register as a grab instead of a hit.
      sinceContact = AIRBORNE_STEPS + 1
    },

    step(dt, rects, bounds, onImpact) {
      accumulator += Math.min(dt, MAX_STEP)
      const hits = []
      while (accumulator >= FIXED_DT) {
        accumulator -= FIXED_DT
        simulate(rects, bounds, hits)
      }

      // One sound per frame, the hardest of them: a body resting on a surface
      // generates a contact every step, and playing them all is a buzz.
      if (hits.length && onImpact) {
        let best = hits[0]
        for (const hit of hits) if (hit.strength > best.strength) best = hit
        onImpact(best.material, best.strength)
      }

      let fastest = 0
      for (const pt of points) {
        fastest = Math.max(fastest, Math.hypot(pt.x - pt.px, pt.y - pt.py))
      }
      if (fastest / FIXED_DT < SLEEP_SPEED) sleepCount++
      else sleepCount = 0
    },

    get held() {
      return grabbed !== null
    },

    get asleep() {
      return sleepCount > SLEEP_FRAMES && !grabbed && !homing
    },

    get airborne() {
      return sinceContact > AIRBORNE_STEPS && !grabbed && !homing
    },

    get center() {
      return centroid()
    },

    /** Centroid velocity in px/s. */
    get velocity() {
      let vx = 0
      let vy = 0
      for (const pt of points) {
        vx += pt.x - pt.px
        vy += pt.y - pt.py
      }
      return {
        x: vx / points.length / FIXED_DT,
        y: vy / points.length / FIXED_DT,
      }
    },

    /** Collision radius carried by each vertex — how far the body reaches
     *  past its centre, which callers need to test their own contacts. */
    get reach() {
      return pr
    },

    /** Degrees, measured from the body's rest orientation. */
    get angle() {
      const c = centroid()
      // The midpoint of the two upper vertices is the body's "up".
      const ux = (points[0].x + points[1].x) / 2 - c.x
      const uy = (points[0].y + points[1].y) / 2 - c.y
      return (Math.atan2(ux, -uy) * 180) / Math.PI
    },
  }
}
