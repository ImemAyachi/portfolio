/**
 * Impact sounds, synthesised rather than loaded.
 *
 * The point of the effect is that a hit sounds like how hard it landed, so
 * pitch, length and brightness all have to track the impact speed — a fixed
 * audio file can only ever be replayed at one volume. It also keeps the page
 * free of another request, and every sound here is a few nodes that the
 * browser collects as soon as they stop.
 */

// Each surface gets its own body frequency, decay and noise mix: the ink bar
// reads as something solid and low, the paper as a dry slap, the framed
// portrait as a hard tap on glass.
const MATERIALS = {
  ink: { freq: 74, noise: 0.3, decay: 0.22, q: 2.2 },
  paper: { freq: 158, noise: 0.85, decay: 0.09, q: 1.0 },
  glass: { freq: 440, noise: 0.55, decay: 0.14, q: 7 },
  wall: { freq: 104, noise: 0.45, decay: 0.17, q: 1.8 },
  floor: { freq: 88, noise: 0.5, decay: 0.2, q: 1.6 },
}

// Two hits inside this window collapse into one — a body rolling to a stop
// makes contact every step, and playing each is a buzz rather than a thud.
const MIN_GAP_MS = 55

let ctx = null
let master = null
let noise = null
let lastPlayed = 0

function ensureContext() {
  if (ctx) return ctx
  const AudioCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioCtor) return null

  ctx = new AudioCtor()
  master = ctx.createGain()
  master.gain.value = 1.1

  // A limiter between the mix and the output. The hits are loud enough now
  // that a hard landing plus its noise burst would sum past 1.0 and clip into
  // a crackle; this catches the peaks instead of forcing the whole thing
  // quieter to leave headroom.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 3
  limiter.ratio.value = 14
  limiter.attack.value = 0.002
  limiter.release.value = 0.14

  master.connect(limiter).connect(ctx.destination)

  // One second of white noise, reused by every contact.
  const frames = Math.floor(ctx.sampleRate * 0.4)
  noise = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  return ctx
}

/** Call from a real user gesture. Browsers refuse to start an AudioContext
 *  outside one, and a context created earlier just sits suspended. */
export function primeAudio() {
  const c = ensureContext()
  if (c && c.state === 'suspended') c.resume()
}

/**
 * The sound of the hand being knocked back up.
 *
 * Deliberately not an impact: it is a clean pitched blip that climbs a
 * semitone per consecutive hit, so a run you are winning sounds like it. The
 * climb caps two octaves up, past which it stops reading as musical.
 */
export function playBat(combo) {
  const c = ctx
  if (!c || c.state !== 'running') return

  const t = c.currentTime
  // A combo of 0 means the hit was legal but scored nothing — a flat, low
  // note, so a save is audibly different from a point.
  const scored = combo > 0
  const semitones = scored ? Math.min(24, combo - 1) : 0
  const freq = (scored ? 392 : 196) * Math.pow(2, semitones / 12)
  const decay = scored ? 0.16 : 0.1

  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  // A couple of milliseconds of attack, so it reads as struck rather than
  // switched on.
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + decay + 0.02)

  // A short click on top, for the contact itself.
  const tick = c.createBufferSource()
  tick.buffer = noise
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = freq * 3
  band.Q.value = 4
  const tickGain = c.createGain()
  tickGain.gain.setValueAtTime(0.28, t)
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
  tick.connect(band).connect(tickGain).connect(master)
  tick.start(t)
  tick.stop(t + 0.07)
}

export function playImpact(material, strength) {
  const c = ctx
  // Never build a context here: this runs from the physics loop, which is not
  // a user gesture. primeAudio has to have been called first.
  if (!c || c.state !== 'running') return

  const now = performance.now()
  if (now - lastPlayed < MIN_GAP_MS) return

  const s = Math.max(0, Math.min(1, strength))
  if (s < 0.03) return
  lastPlayed = now

  const m = MATERIALS[material] ?? MATERIALS.wall
  const t = c.currentTime
  const level = 0.16 + s * 0.84
  // A harder hit rings a little longer as well as louder.
  const decay = m.decay * (0.6 + s * 0.55)

  // Body: a pitched thump that drops as it dies away.
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(m.freq * (1 + s * 0.4), t)
  osc.frequency.exponentialRampToValueAtTime(m.freq * 0.55, t + decay)
  const oscGain = c.createGain()
  oscGain.gain.setValueAtTime(level, t)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  osc.connect(oscGain).connect(master)
  osc.start(t)
  osc.stop(t + decay + 0.02)

  // Contact: a short filtered noise burst for the texture of the surface.
  const burst = c.createBufferSource()
  burst.buffer = noise
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = m.freq * 4 * (0.8 + s * 0.6)
  band.Q.value = m.q
  const burstGain = c.createGain()
  const burstDecay = decay * 0.45
  burstGain.gain.setValueAtTime(level * m.noise, t)
  burstGain.gain.exponentialRampToValueAtTime(0.0001, t + burstDecay)
  burst.connect(band).connect(burstGain).connect(master)
  burst.start(t)
  burst.stop(t + burstDecay + 0.02)
}
