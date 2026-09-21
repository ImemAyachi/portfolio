import { useEffect, useRef } from 'react'
import { isScrollLocked } from '../lib/scroll'
import './SparkleCursor.css'

// The mark from the loader's "i", reused so the cursor belongs to the brand.
const SPARKLE =
  'M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z'

// Recycled pool — sparkles are reused in order rather than created and
// destroyed on every move.
const POOL = 22
// Travel between blooms, so speed sets the density.
const SPAWN_DISTANCE = 38
// Where the sparkle rides relative to the pointer. Applied in JS rather than
// as a CSS margin so the trail can bloom from this same point.
const LEAD_OFFSET = { x: 15, y: -11 }
// Time constant of the follow easing, in ms. Larger = looser, longer trail.
const FOLLOW_TAU = 70
// Half the label's height, and so the radius of its end caps. Must match
// --cap in the CSS.
const CAP = 15
// Tip radius of the collapsed sparkle, sized to sit between the leader's
// resting 22px and its 34px snapped state.
const SEED = 13
// Clearance kept from the right edge before the label opens the other way.
const EDGE_PAD = 12

/**
 * Over a link the leader stops being a mark beside the pointer and becomes
 * the link's own background: the sparkle unfolds into a block covering it.
 * The layer is difference-blended, so a white block inverts whatever is under
 * it — cream-on-dark becomes dark-on-cream and back — without this having to
 * know a single one of the site's colours.
 *
 * The leader's box is a fixed size large enough for any of them, and the clip
 * does all the shaping. Resizing the box mid-morph instead would clip the
 * shape against its own edges while the two were out of step.
 */
const BOX_W = 460
const BOX_H = 120
// Breathing room around the link inside the block. Wide and shallow on
// purpose: the block should read as a rule drawn through the words, not as a
// button they have been dropped into.
const WRAP_PAD_X = 30
const WRAP_PAD_Y = 3
// Past this the inversion stops reading as a highlight and starts looking
// like a fault; those targets keep the old centre snap.
const MAX_WRAP_W = 300
const MAX_WRAP_H = 56
// Barely-turned corners, so the block stays a rule rather than a lozenge.
const WRAP_RADIUS = 6

/**
 * The label morphs from the sparkle's own outline into the pill's, by
 * interpolating one clip-path polygon into another.
 *
 * Both shapes are emitted with the same number of vertices, in the same
 * order, with the four extremes landing on the same indices — the star's tips
 * become the pill's top, bottom and end caps. That correspondence is the
 * whole trick: without it the browser cannot interpolate the two at all, and
 * with a mismatched order the shape turns itself inside out on the way.
 *
 * A multiple of four, so each quadrant gets the same treatment. Eight a side
 * is enough for the star's concave curves and for caps that read as round
 * rather than chamfered.
 */
const CLIP_POINTS = 32
const PER_QUADRANT = CLIP_POINTS / 4

// The sparkle glyph's own quadrant, normalised: a cubic from the tip at
// (0,1) to the tip at (1,0), pulled toward the centre by its control points.
// Taken from the traced path, so the clip matches the drawn sparkle.
const SPARKLE_CTRL = 0.4477

function sparklePolygon(cx, cy, r) {
  const points = []
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    for (let step = 0; step < PER_QUADRANT; step++) {
      const t = step / PER_QUADRANT
      const u = 1 - t
      let x = 3 * u * t * t * SPARKLE_CTRL + t * t * t
      let y = u * u * u + 3 * u * u * t * SPARKLE_CTRL
      // Rotate a quarter turn per quadrant, which is how the glyph is built.
      for (let i = 0; i < quadrant; i++) [x, y] = [y, -x]
      points.push([cx + x * r, cy + y * r])
    }
  }
  return points
}

// Split of each quadrant's vertices between its straight edge and its cap.
// Deliberately not proportional to length: a straight edge is fully described
// by its ends, while a cap needs points to look round. Walking the outline by
// arc length instead spends most of a long pill's budget on the flat part and
// leaves the caps visibly chamfered.
const STRAIGHT_PTS = 3
const ARC_PTS = PER_QUADRANT - STRAIGHT_PTS
const QUARTER = Math.PI / 2

function pillPolygon(w, h, ox = 0, oy = 0) {
  const r = h / 2
  const straight = Math.max(0, w / 2 - r)
  const points = []

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    for (let j = 0; j < PER_QUADRANT; j++) {
      // Two quadrants run edge-then-cap and two run cap-then-edge, so the
      // walk stays continuous all the way round.
      const capFirst = quadrant === 1 || quadrant === 3
      const onCap = capFirst ? j < ARC_PTS : j >= STRAIGHT_PTS
      const f = capFirst
        ? (j - ARC_PTS) / STRAIGHT_PTS
        : j / STRAIGHT_PTS
      const a = capFirst
        ? (j / ARC_PTS) * QUARTER
        : ((j - STRAIGHT_PTS) / ARC_PTS) * QUARTER

      if (quadrant === 0) {
        // Bottom centre, right along the bottom, up around the right cap.
        points.push(
          onCap
            ? [w - r + r * Math.sin(a), h / 2 + r * Math.cos(a)]
            : [w / 2 + f * straight, h]
        )
      } else if (quadrant === 1) {
        // Right cap up to the top edge, then left toward the top centre.
        points.push(
          onCap
            ? [w - r + r * Math.cos(a), h / 2 - r * Math.sin(a)]
            : [w - r - f * straight, 0]
        )
      } else if (quadrant === 2) {
        // Top centre, left along the top, down around the left cap.
        points.push(
          onCap
            ? [r - r * Math.sin(a), h / 2 - r * Math.cos(a)]
            : [w / 2 - f * straight, 0]
        )
      } else {
        // Left cap down to the bottom edge, then right back to the start.
        points.push(
          onCap
            ? [r - r * Math.cos(a), h / 2 + r * Math.sin(a)]
            : [r + f * straight, h]
        )
      }
    }
  }
  return ox || oy ? points.map(([x, y]) => [x + ox, y + oy]) : points
}

/**
 * A rounded rectangle with an arbitrary corner radius, in the same 32-point
 * order as the star so the two can interpolate.
 *
 * Separate from pillPolygon because that one is a stadium — its ends are
 * always semicircles of half the height, which on a long, shallow bar reads
 * as a lozenge rather than a rule. Here each quadrant is split into a fixed
 * two points along its first edge, four around the corner, and two along its
 * second: the corners keep their shape whatever the bar's proportions,
 * whereas walking by length would spend the budget on the long flat sides.
 */
function roundedRect(w, h, radius, ox = 0, oy = 0) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  const midX = Math.max(0, w / 2 - r)
  const midY = Math.max(0, h / 2 - r)
  const points = []

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    for (let j = 0; j < PER_QUADRANT; j++) {
      const onFirst = j < 2
      const onArc = j >= 2 && j < 6
      const f = onFirst ? j / 2 : (j - 6) / 2
      const a = ((j - 2) / 4) * QUARTER
      let p

      if (quadrant === 0) {
        // Bottom centre, right along the bottom, round the corner, up.
        if (onFirst) p = [w / 2 + f * midX, h]
        else if (onArc) p = [w - r + r * Math.sin(a), h - r + r * Math.cos(a)]
        else p = [w, h - r - f * midY]
      } else if (quadrant === 1) {
        // Right edge up, round the corner, left along the top.
        if (onFirst) p = [w, h / 2 - f * midY]
        else if (onArc) p = [w - r + r * Math.cos(a), r - r * Math.sin(a)]
        else p = [w - r - f * midX, 0]
      } else if (quadrant === 2) {
        // Top centre, left along the top, round the corner, down.
        if (onFirst) p = [w / 2 - f * midX, 0]
        else if (onArc) p = [r - r * Math.sin(a), r - r * Math.cos(a)]
        else p = [0, r + f * midY]
      } else {
        // Left edge down, round the corner, right along the bottom.
        if (onFirst) p = [0, h / 2 + f * midY]
        else if (onArc) p = [r - r * Math.cos(a), h - r + r * Math.sin(a)]
        else p = [r + f * midX, h]
      }
      points.push([p[0] + ox, p[1] + oy])
    }
  }
  return points
}

const toClip = (points) =>
  `polygon(${points
    .map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
    .join(',')})`

function Sparkle({ className }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 180.2 180.2" aria-hidden="true">
        <path d={SPARKLE} />
      </svg>
    </span>
  )
}

export default function SparkleCursor() {
  const layerRef = useRef(null)
  const leadRef = useRef(null)
  const labelRef = useRef(null)
  const labelTextRef = useRef(null)

  useEffect(() => {
    const layer = layerRef.current
    const lead = leadRef.current
    const label = labelRef.current
    const labelText = labelTextRef.current
    if (!layer || !lead) return
    // Pointless without a real pointer, and unwelcome if motion is reduced.
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // The closed star at the left cap never changes, so it is built once.
    label?.style.setProperty(
      '--clip-seed',
      toClip(sparklePolygon(CAP, CAP, SEED))
    )
    // The leader's resting star, sitting in the middle of its fixed box.
    lead.style.setProperty(
      '--clip-star',
      toClip(sparklePolygon(BOX_W / 2, BOX_H / 2, 11))
    )

    const nodes = Array.from(layer.querySelectorAll('.spk__item'))
    const target = { x: -100, y: -100 }
    const current = { x: -100, y: -100 }
    let index = 0
    let lastBloom = null
    let labelWidth = 0
    let labelOn = false
    let wrapW = 0
    let wrapH = 0
    let raf = 0
    let seen = false
    let lastFrame = performance.now()

    const follow = (now) => {
      // Exponential smoothing weighted by real elapsed time, so the motion
      // is identical on a 60Hz and a 144Hz display — a fixed per-frame
      // factor would race on high-refresh screens and stutter on slow ones.
      const dt = Math.min(64, now - lastFrame)
      lastFrame = now

      // Idle behind an overlay: the cursor is covered, and the frames are
      // better spent on the overlay's own transition.
      if (isScrollLocked()) {
        raf = requestAnimationFrame(follow)
        return
      }
      const k = 1 - Math.exp(-dt / FOLLOW_TAU)
      current.x += (target.x - current.x) * k
      current.y += (target.y - current.y) * k

      const sx = current.x + LEAD_OFFSET.x
      const sy = current.y + LEAD_OFFSET.y
      lead.style.setProperty('--lx', `${sx.toFixed(2)}px`)
      lead.style.setProperty('--ly', `${sy.toFixed(2)}px`)
      // The label rides the same smoothed point, but lives outside the
      // difference-blend layer so its colour is predictable.
      if (label) {
        label.style.setProperty('--lx', `${sx.toFixed(2)}px`)
        label.style.setProperty('--ly', `${sy.toFixed(2)}px`)
      }

      // Trail is emitted along the sparkle's own smoothed path, not the raw
      // pointer path — so it streams out of the sparkle, and keeps flowing
      // for a moment after the pointer stops while the sparkle catches up.
      if (
        seen &&
        (!lastBloom || Math.hypot(sx - lastBloom.x, sy - lastBloom.y) >= SPAWN_DISTANCE)
      ) {
        lastBloom = { x: sx, y: sy }
        bloom(sx, sy)
      }

      raf = requestAnimationFrame(follow)
    }

    const bloom = (x, y) => {
      const node = nodes[index]
      index = (index + 1) % nodes.length

      node.style.setProperty('--x', `${x}px`)
      node.style.setProperty('--y', `${y}px`)
      node.style.setProperty('--s', (0.45 + Math.random() * 0.85).toFixed(2))
      node.style.setProperty('--r', `${Math.round(120 + Math.random() * 180)}deg`)
      node.style.setProperty('--dx', `${(Math.random() * 34 - 17).toFixed(1)}px`)
      node.style.setProperty('--dy', `${(-12 - Math.random() * 26).toFixed(1)}px`)

      // Retrigger the animation on a recycled node.
      node.classList.remove('is-on')
      void node.offsetWidth
      node.classList.add('is-on')
    }

    // Movement only feeds the target; the rAF loop owns both the sparkle's
    // position and when the trail emits.
    const onMove = (event) => {
      let { clientX: x, clientY: y } = event

      // Snapping: over something interactive, the sparkle leaves the pointer
      // and locks to the element's centre, so it reads as "this is live".
      const hit = event.target.closest?.('a, button, [data-snap]')
      const spoken = event.target.closest?.('[data-cursor]')
      const text = spoken?.dataset.cursor || ''

      let wrapping = false
      if (hit) {
        // The words, not the click target. A link's box carries whatever
        // padding and underline it needs, and wrapping that puts the text up
        // in the corner of an oversized block instead of in the middle of a
        // snug one. A range over the contents measures only the glyphs.
        const box = hit.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(hit)
        const textBox = range.getBoundingClientRect()
        range.detach?.()

        // Intersected, not simply preferred: the text can also reach *past*
        // the element — the social links keep a second copy of their label
        // parked below the box for the roll-up, which measures three times
        // the height they actually show. The overlap is the visible words.
        const left = Math.max(box.left, textBox.left)
        const right = Math.min(box.right, textBox.right)
        const top = Math.max(box.top, textBox.top)
        const bottom = Math.min(box.bottom, textBox.bottom)
        const r =
          right - left > 2 && bottom - top > 2
            ? { left, top, width: right - left, height: bottom - top }
            : box

        // Cancel LEAD_OFFSET so the leader lands dead-centre when snapped.
        x = r.left + r.width / 2 - LEAD_OFFSET.x
        y = r.top + r.height / 2 - LEAD_OFFSET.y

        // Anything that speaks for itself gets the label instead — one or the
        // other, never a block and a caption fighting over the same spot. And
        // anything that already has its own hover treatment opts out, so the
        // two do not paint over each other.
        if (
          !text &&
          !hit.hasAttribute('data-no-invert') &&
          r.width <= MAX_WRAP_W &&
          r.height <= MAX_WRAP_H
        ) {
          wrapping = true
          const w = Math.round(r.width + WRAP_PAD_X)
          const h = Math.round(r.height + WRAP_PAD_Y)
          if (w !== wrapW || h !== wrapH) {
            wrapW = w
            wrapH = h
            lead.style.setProperty(
              '--clip-wrap',
              toClip(
                roundedRect(w, h, WRAP_RADIUS, (BOX_W - w) / 2, (BOX_H - h) / 2)
              )
            )
          }
        }
      }

      layer.classList.toggle('is-snapped', Boolean(hit))
      layer.classList.toggle('is-wrapping', wrapping)

      // Anything can say what the pointer would do there. Read off the DOM
      // rather than a registry, so a new element only has to declare it.
      if (label && labelText) {
        if (text && text !== labelText.textContent) {
          labelText.textContent = text
          // The outlines depend on how wide the words are, so they are rebuilt
          // here — once per label change, never per frame.
          labelWidth = Math.ceil(labelText.getBoundingClientRect().width) + CAP * 2
          label.style.setProperty('--label-w', `${labelWidth}px`)
          label.style.setProperty(
            '--clip-pill',
            toClip(pillPolygon(labelWidth, CAP * 2))
          )
          // The closed star for the mirrored case, sitting on the right cap.
          label.style.setProperty(
            '--clip-seed-end',
            toClip(sparklePolygon(labelWidth - CAP, CAP, SEED))
          )
        }

        // Which way it opens is decided once, as it opens: re-testing every
        // frame would make an open label jump sides while it is being read.
        if (text && !labelOn) {
          const reach = x + LEAD_OFFSET.x + labelWidth - CAP
          label.classList.toggle(
            'is-flipped',
            reach > window.innerWidth - EDGE_PAD
          )
        }
        labelOn = Boolean(text)
        label.classList.toggle('is-on', labelOn)
        // The sparkle fades as the pill's cap takes its place, so the two
        // read as one thing changing shape rather than two swapping over.
        layer.classList.toggle('is-labelled', Boolean(text))
      }

      target.x = x
      target.y = y

      if (!seen) {
        seen = true
        current.x = x
        current.y = y
        layer.classList.add('is-awake')
      }
    }

    const onLeave = () => layer.classList.remove('is-awake')
    const onEnter = () => layer.classList.add('is-awake')

    raf = requestAnimationFrame(follow)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('pointerenter', onEnter)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerenter', onEnter)
    }
  }, [])

  return (
    <>
      <div className="spk" ref={layerRef} aria-hidden="true">
        {/* The leader is a plain white block; its clip decides whether that
            block is a star or the shape of the link it is sitting on. */}
        <span className="spk__lead" ref={leadRef}>
          <span className="spk__lead-fill" />
        </span>
        {Array.from({ length: POOL }, (_, i) => (
          <Sparkle key={i} className="spk__item" />
        ))}
      </div>

      {/* Outside .spk deliberately: that layer is difference-blended, which
          would invert the label against whatever is behind it and make the
          colour unpredictable.

          The pill itself is the animated box — it starts as a circle the size
          of the sparkle and widens — and the text sits inside it, clipped, so
          it is uncovered as the pill opens rather than being scaled. */}
      <span className="spk-label" ref={labelRef} aria-hidden="true">
        <span className="spk-label__text" ref={labelTextRef} />
      </span>
    </>
  )
}
