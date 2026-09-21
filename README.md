# Portfolio — Imem Ayachi

A scroll-driven personal portfolio for a fullstack developer, built as a single art-directed page. Editorial/print aesthetic: cream stock, ink type, rust accents, torn-paper edges and press furniture.

No CSS framework and no animation library — every effect here is hand-built.

## Stack

- **React 19** + **Vite**
- Plain CSS, one stylesheet per component, design tokens in `src/index.css`
- [Lenis](https://github.com/darkroomengineering/lenis) for smooth scroll
- Oxlint

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
npm run preview  # serve the build
npm run lint
```

## What's in here

The page is a sequence of full-height sections under `src/components/`, plus a few pieces of machinery worth pointing at:

| Path | What it does |
| --- | --- |
| `components/Loader.jsx` | Draws the "i" mark, then grows its sparkle geometrically until it covers the viewport. The growth curve is built in JS because it depends on a runtime viewport measurement. |
| `lib/ragdoll.js` | Verlet physics for the draggable hand: a 3-point rigid body, distance constraints, a fixed 120 Hz timestep, restitution, resting-contact absorption and sleep detection. |
| `lib/impactAudio.js` | WebAudio impact synthesis — a voice per material, run through a limiter, gated on a user gesture. |
| `components/RagdollHand.jsx` | The hand toy and the keepie-uppie game built on it: mouse-following paddle, a difficulty ramp and a local leaderboard. |
| `components/SparkleCursor.jsx` | Cursor sparkle that morphs between a star, a label pill and a link's own footprint via matched-vertex `clip-path` polygons, inverting what it covers with `mix-blend-mode: difference`. |
| `lib/magnetic.js` | One pointer listener and one rAF driving every `[data-magnetic]` element. |
| `components/SiteNav.jsx` | Derives each section's luminance and flips the bar's colours against whatever is behind it. |

Accessibility and performance notes live in the comments next to the code they explain. Everything respects `prefers-reduced-motion`.

## Status

Work in progress. The structure and interaction work are real; much of the copy — experience entries, case-study prose, gallery captions, the contact address and social links — is still placeholder.
