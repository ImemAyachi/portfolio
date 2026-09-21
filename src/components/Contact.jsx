import { useEffect, useRef, useState } from 'react'
import { playImpact, primeAudio } from '../lib/impactAudio'
import './Contact.css'

// Placeholder — swap for the address you actually want published.
const EMAIL = 'hello@imemayachi.com'

// Where the note ends up, and how much of one this will carry. Long enough
// for a real opening line, short enough that nobody writes a brief into a
// mailto URL.
const NOTE_MAX = 160
const NOTE_SUBJECT = 'Hello from your site'

// The brand mark from the loader's "i", reused for the availability line.
const SPARKLE =
  'M90.1,180.2 C90.1,130.44 130.44,90.1 180.2,90.1 C130.44,90.1 90.1,49.76 90.1,0 C90.1,49.76 49.76,90.1 0,90.1 C49.76,90.1 90.1,130.44 90.1,180.2 Z'

// PLACEHOLDER handles — they roll up in place of the label on hover, so put
// the real ones here alongside the real hrefs.
const SOCIALS = [
  { label: 'GitHub', handle: '@imemayachi', href: '#github' },
  { label: 'LinkedIn', handle: 'in/imemayachi', href: '#linkedin' },
  { label: 'Instagram', handle: '@imem.ayachi', href: '#instagram' },
  { label: 'X', handle: '@imemayachi', href: '#x' },
]

/**
 * What the hour in Tunis actually implies, so the clock says something rather
 * than only counting. Read from the same formatted value shown on screen, so
 * the words can never disagree with the digits next to them.
 */
function moodFor(hour) {
  if (!Number.isFinite(hour)) return ''
  if (hour >= 23 || hour < 7) return 'asleep — it will keep'
  if (hour < 10) return 'coffee first'
  if (hour < 13) return 'head down'
  if (hour < 18) return 'at my desk'
  return 'still around'
}

export default function Contact() {
  const sectionRef = useRef(null)
  const noteRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [time, setTime] = useState('')
  const [hour, setHour] = useState(NaN)
  const [note, setNote] = useState('')

  // Live local clock — a small sign of a real person on the other end.
  useEffect(() => {
    // Built once: constructing a formatter every second is the expensive part
    // of this, not the formatting.
    let format
    try {
      format = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Africa/Tunis',
      })
    } catch {
      // Some environments reject named time zones; fall back to local.
      format = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    }

    const tick = () => {
      const parts = format.formatToParts(new Date())
      const read = (type) => parts.find((p) => p.type === type)?.value ?? ''
      setTime(`${read('hour')}:${read('minute')}:${read('second')}`)
      // Taken from the same parts as the digits, so the phrase beside the
      // clock can never describe a different hour than the one on show.
      setHour(Number(read('hour')))
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  /**
   * Start typing anywhere in the section and the note takes the keystrokes.
   *
   * The text itself lands in a real input rather than being accumulated from
   * keydowns. Reading `event.key` looks simpler but silently drops everything
   * that is composed rather than pressed — dead keys, IME, and so accented
   * characters — and it would ignore paste and mobile keyboards entirely.
   * This listener only spots the intent to type and hands over; the field
   * does the rest, and is focusable in its own right for anyone who would
   * rather tab to it.
   *
   * Only listens while the section is on screen: a global key handler that
   * swallows characters halfway up the page would be a trap.
   */
  useEffect(() => {
    const section = sectionRef.current
    const field = noteRef.current
    if (!section || !field) return
    let listening = false

    const onKeyDown = (event) => {
      if (document.activeElement === field) return
      // Never steal keys from another field — the game's name entry is one.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      // Shortcuts stay shortcuts.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // A single-character `key` is the signal that someone has started
      // writing. The character is seeded by hand because focusing midway
      // through an event does not redirect the keystroke that caused it.
      if (event.key.length !== 1) return
      event.preventDefault()
      field.focus()
      setNote(event.key)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === listening) return
        listening = entry.isIntersecting
        if (listening) window.addEventListener('keydown', onKeyDown)
        else {
          window.removeEventListener('keydown', onKeyDown)
          field.blur()
          setNote('')
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(section)
    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const sendNote = () => {
    if (!note.trim()) return
    window.location.href =
      `mailto:${EMAIL}` +
      `?subject=${encodeURIComponent(NOTE_SUBJECT)}` +
      `&body=${encodeURIComponent(note)}`
    setNote('')
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL)
      setCopied(true)
      // A click is a real gesture, so this is a legal place to start audio.
      // 'ink' is the same voice the torn bar uses — the right weight for
      // something being pressed onto the page.
      primeAudio()
      playImpact('ink', 0.7)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked (insecure origin, denied permission) —
      // fall through to the mailto link rather than failing silently.
      window.location.href = `mailto:${EMAIL}`
    }
  }

  return (
    <section className="ct" id="contact" ref={sectionRef}>
      <div className="ct__inner">
        <div className="ct__top">
          <span className="ct__status">
            {/* Explicit width/height as well as the viewBox — without an
                intrinsic size the SVG renders at its default 300px. */}
            <svg
              className="ct__status-mark"
              width="10"
              height="10"
              viewBox="0 0 180.2 180.2"
              aria-hidden="true"
            >
              <path d={SPARKLE} />
            </svg>
            <span className="ct__status-text">Available for work</span>
            <span className="ct__status-rule" aria-hidden="true" />
            <span className="ct__status-year">{new Date().getFullYear()}</span>
          </span>
        </div>

        <h2 className="ct__title">
          <span className="ct__line">
            <span>Let&rsquo;s build</span>
          </span>
          <span className="ct__line">
            <span>something good.</span>
          </span>
        </h2>

        <div className="ct__action">
          <button
            type="button"
            className="ct__button"
            onClick={copyEmail}
            data-magnetic
            // It sweeps its own cream fill up on approach; a second, inverted
            // fill on top of that is one treatment too many.
            data-no-invert
          >
            <span className="ct__button-inner">{EMAIL}</span>
          </button>
          {/* Pressed onto the page rather than swapped in: the address stays
              put, and the confirmation lands on top of it. */}
          <span className={`ct__stamp ${copied ? 'is-on' : ''}`} aria-hidden="true">
            Copied
          </span>
          <span className="ct__hint">
            {copied ? 'In your clipboard' : '[ click to copy ]'}
          </span>
        </div>

        {/* Start typing anywhere in the section and this takes over. It is a
            real field, so composed characters, paste and mobile keyboards all
            work, and it can simply be tabbed to. */}
        <div className={`ct__note ${note ? 'is-live' : ''}`}>
          <input
            ref={noteRef}
            className="ct__note-input"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                sendNote()
              } else if (event.key === 'Escape') {
                setNote('')
                event.currentTarget.blur()
              }
            }}
            maxLength={NOTE_MAX}
            placeholder="Or just start typing…"
            aria-label={`Write a note to send to ${EMAIL}`}
            autoComplete="off"
          />
          <button
            type="button"
            className="ct__note-send"
            onClick={sendNote}
            tabIndex={note ? 0 : -1}
            aria-hidden={!note}
          >
            Enter to send
          </button>
        </div>

        <div className="ct__foot">
          <ul className="ct__socials">
            {SOCIALS.map((social) => (
              <li key={social.label}>
                {/* The label rolls up and the handle takes its place, so the
                    hover says something the label did not. */}
                <a href={social.href} data-magnetic>
                  <span>{social.label}</span>
                  <span aria-hidden="true">{social.handle}</span>
                </a>
              </li>
            ))}
          </ul>

          <span className="ct__clock">
            <i>Tunis</i>
            <b>{time}</b>
            <em>{moodFor(hour)}</em>
          </span>
        </div>

        <div className="ct__legal">
          <span>© {new Date().getFullYear()} Imem Ayachi</span>
          <span>Built from scratch</span>
        </div>
      </div>
    </section>
  )
}
