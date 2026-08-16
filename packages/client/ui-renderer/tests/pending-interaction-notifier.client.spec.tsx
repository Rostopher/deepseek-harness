// @vitest-environment jsdom
/**
 * PendingInteractionNotifier through plain props: rising-edge chime and
 * hidden-tab system notification, no repeat while the same interaction
 * stays pending, re-alert after resolution, permission/visibility gating,
 * first-gesture arming, and browser-absent guards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { PendingInteractionNotifier } from '../src/client/PendingInteractionNotifier.tsx'
import type { PendingInteractionAlert } from '../src/client/PendingInteractionNotifier.tsx'

class OscillatorStub {
  type = ''
  frequency = { value: 0 }
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class GainStub {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
}

const oscillators: OscillatorStub[] = []
const audioContexts: AudioContextStub[] = []

class AudioContextStub {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = {}
  resume = vi.fn<() => Promise<void>>(() => Promise.resolve())
  createOscillator = vi.fn(() => {
    const oscillator = new OscillatorStub()
    oscillators.push(oscillator)
    return oscillator
  })
  createGain = vi.fn(() => new GainStub())
  constructor() {
    audioContexts.push(this)
  }
}

const notifications: NotificationStub[] = []

class NotificationStub {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>(() => {
    NotificationStub.permission = 'granted'
    return Promise.resolve('granted')
  })
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(readonly title: string, readonly options?: NotificationOptions) {
    notifications.push(this)
  }
}

let tabHidden = true

const alert = (overrides?: Partial<PendingInteractionAlert>): PendingInteractionAlert => ({
  sessionId: 's1' as SessionId,
  status: 'approval',
  displayTitle: '修复登录',
  ...overrides,
})

function renderNotifier(alerts: readonly PendingInteractionAlert[], onOpen = vi.fn()) {
  const view = render(<PendingInteractionNotifier alerts={alerts} onOpen={onOpen} />)
  return {
    ...view,
    onOpen,
    update: (next: readonly PendingInteractionAlert[]) => {
      view.rerender(<PendingInteractionNotifier alerts={next} onOpen={onOpen} />)
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', AudioContextStub)
  vi.stubGlobal('Notification', NotificationStub)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => tabHidden })
  window.focus = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  oscillators.length = 0
  // audioContexts accumulates: the module's shared AudioContext is minted once per file.
  notifications.length = 0
  tabHidden = true
  NotificationStub.permission = 'granted'
})

describe('PendingInteractionNotifier', () => {
  it('chimes and notifies on a rising edge while the tab is hidden', () => {
    renderNotifier([alert()])
    expect(oscillators).toHaveLength(2)
    expect(oscillators[0]!.frequency.value).toBe(880)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]!.title).toBe('DeepSeek Harness')
    expect(notifications[0]!.options?.body).toBe('「修复登录」等待审批')
  })

  it('does not repeat while the same interaction stays pending', () => {
    const view = renderNotifier([alert()])
    view.update([alert()])
    expect(notifications).toHaveLength(1)
    expect(oscillators).toHaveLength(2)
  })

  it('alerts again after the interaction resolves and a new one arrives', () => {
    const view = renderNotifier([alert()])
    view.update([])
    view.update([alert()])
    expect(notifications).toHaveLength(2)
    expect(oscillators).toHaveLength(4)
  })

  it('renders per-kind copy for plan review and question', () => {
    tabHidden = true
    renderNotifier([alert({ status: 'plan-review' }), alert({ sessionId: 's2' as SessionId, status: 'question' })])
    expect(notifications[0]!.options?.body).toBe('「修复登录」计划待确认')
    expect(notifications[1]!.options?.body).toBe('「修复登录」等待你的回答')
  })

  it('chimes but skips the system notification while the tab is visible', () => {
    tabHidden = false
    renderNotifier([alert()])
    expect(oscillators).toHaveLength(2)
    expect(notifications).toHaveLength(0)
  })

  it('requests permission instead of notifying while permission is default', () => {
    NotificationStub.permission = 'default'
    renderNotifier([alert()])
    expect(NotificationStub.requestPermission).toHaveBeenCalled()
    expect(notifications).toHaveLength(0)
    expect(oscillators).toHaveLength(2)
  })

  it('stays silent on system notification when permission is denied', () => {
    NotificationStub.permission = 'denied'
    renderNotifier([alert()])
    expect(notifications).toHaveLength(0)
    expect(oscillators).toHaveLength(2)
  })

  it('focuses the window and opens the session on notification click', () => {
    const view = renderNotifier([alert()])
    notifications[0]!.onclick?.()
    expect(window.focus).toHaveBeenCalled()
    expect(view.onOpen).toHaveBeenCalledWith('s1')
    expect(notifications[0]!.close).toHaveBeenCalled()
  })

  it('resumes a suspended audio context on the arming gesture', () => {
    renderNotifier([alert()])
    const context = audioContexts.at(-1)
    expect(context).toBeDefined()
    context!.state = 'suspended'
    act(() => { window.dispatchEvent(new Event('pointerdown')) })
    expect(context!.resume).toHaveBeenCalled()
  })

  it('arms audio and notification permission on the first user gesture', () => {
    NotificationStub.permission = 'default'
    renderNotifier([])
    act(() => { window.dispatchEvent(new Event('pointerdown')) })
    expect(NotificationStub.requestPermission).toHaveBeenCalledTimes(1)
    act(() => { window.dispatchEvent(new Event('keydown')) })
    expect(NotificationStub.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('tolerates browsers without the Notification API', () => {
    Reflect.deleteProperty(globalThis, 'Notification')
    expect(() => renderNotifier([alert()])).not.toThrow()
    expect(oscillators).toHaveLength(2)
  })

  it('tolerates browsers without WebAudio', () => {
    Reflect.deleteProperty(globalThis, 'AudioContext')
    expect(() => renderNotifier([alert()])).not.toThrow()
    expect(notifications).toHaveLength(1)
  })
})
