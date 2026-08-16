/**
 * Shell-owned pending-interaction alerter: watches the session list's
 * `pendingInteraction` projection and turns each rising edge (a session
 * gaining a blocking approval / plan review / question) into an audible
 * chime plus, while the tab is hidden, a browser system notification that
 * focuses the window and opens the session on click. Pure props — the
 * sessions-store wiring lives in the app-shell assembly (app.tsx).
 */
import { useEffect, useRef } from 'react'
import type { PendingInteractionStatus, SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** One session's blocking user interaction, projected for alerting. */
export interface PendingInteractionAlert {
  /** Session waiting on the user. */
  sessionId: SessionId
  /** Which interaction kind blocks it. */
  status: PendingInteractionStatus
  /** Human-facing session label for the notification body. */
  displayTitle: string
}

/** Props for the pending-interaction alerter. */
export interface PendingInteractionNotifierProps {
  /** Current blocking interactions across all listed sessions. */
  alerts: readonly PendingInteractionAlert[]
  /** Open the alerting session (wired to sessions.open by the shell assembly). */
  onOpen: (sessionId: SessionId) => void
}

/** Notification body per interaction kind (product copy is Chinese). */
const ALERT_COPY: Record<PendingInteractionStatus, string> = {
  approval: '等待审批',
  'plan-review': '计划待确认',
  question: '等待你的回答',
}

/** Chime notes: two sine tones played back to back. */
const ALERT_NOTES = [
  { frequency: 880, duration: 0.12 },
  { frequency: 660, duration: 0.18 },
] as const

/** Peak oscillator gain; the envelope eases to zero over each note. */
const ALERT_GAIN = 0.08

let sharedAudioContext: AudioContext | undefined

/** Lazily mint the one shared AudioContext; undefined where WebAudio is unavailable. */
function alertAudioContext(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined
  sharedAudioContext ??= new AudioContext()
  return sharedAudioContext
}

/** Resume after an autoplay suspension; rejection means the browser still blocks audio (no gesture yet). */
function resumeAudio(context: AudioContext): void {
  if (context.state !== 'suspended') return
  void context.resume().catch(() => {
    // Autoplay policy: no user gesture has reached the page; the first-gesture arming retries.
  })
}

/** Play the two-note chime on the shared context (notes queue while suspended and sound on resume). */
function playAlertSound(): void {
  const context = alertAudioContext()
  if (context === undefined) return
  resumeAudio(context)
  let offset = 0
  for (const note of ALERT_NOTES) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = note.frequency
    const start = context.currentTime + offset
    gain.gain.setValueAtTime(ALERT_GAIN, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + note.duration)
    offset += note.duration
  }
}

/**
 * Request notification permission once; resolution without a gesture may be
 * quiet-denied by the browser, which the next alert's call retries.
 */
function requestNotificationPermission(): void {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  void Notification.requestPermission().catch(() => {
    // Implementations without a promise form never reach here; a rejection leaves no retry handle.
  })
}

/** Fire a system notification for one alert while the tab is hidden; click focuses the window and opens the session. */
function notifyAlert(alert: PendingInteractionAlert, onOpen: (sessionId: SessionId) => void): void {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    requestNotificationPermission()
    return
  }
  if (Notification.permission !== 'granted' || !document.hidden) return
  const notification = new Notification('DeepSeek Harness', {
    body: `「${alert.displayTitle}」${ALERT_COPY[alert.status]}`,
  })
  notification.onclick = () => {
    window.focus()
    onOpen(alert.sessionId)
    notification.close()
  }
}

/** Rising-edge identity: one alert lane per session and interaction kind. */
function alertKey(alert: PendingInteractionAlert): string {
  return `${alert.sessionId}:${alert.status}`
}

/**
 * Alert on each newly blocking interaction: chime on every rising edge,
 * system notification only while the tab is hidden. Also arms both channels
 * on the first user gesture, which browser autoplay/permission policies
 * require before sound or a permission prompt can take effect.
 * @param props - current alerts plus the session-opening callback.
 * @returns no rendered content.
 */
export function PendingInteractionNotifier({ alerts, onOpen }: PendingInteractionNotifierProps): null {
  const previousKeys = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const keys = new Set(alerts.map(alertKey))
    for (const alert of alerts) {
      if (previousKeys.current.has(alertKey(alert))) continue
      playAlertSound()
      notifyAlert(alert, onOpen)
    }
    previousKeys.current = keys
  }, [alerts, onOpen])

  useEffect(() => {
    const arm = (): void => {
      const context = alertAudioContext()
      if (context !== undefined) resumeAudio(context)
      requestNotificationPermission()
    }
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [])

  return null
}
