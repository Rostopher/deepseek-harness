# Agent Note: Web pending-interaction alerts — shell-owned chime and system notification

Status: implemented

English | [中文](2026-08-14-web-pending-interaction-alerts.zh.md)

## Problem

A pending approval in the web UI surfaced only as in-page chrome: the ApprovalPanel composer takeover and the sidebar's amber status dot (`SessionSummary.pendingInteraction`). Both are invisible when the browser tab is not focused, and the repository had no attention mechanism at all — no audio, no Notification API, no title flashing — so an agent waiting on approval sat silently until the user happened to switch back.

## Decision

The web shell (`@deepseek-ai/dsh-client-ui-renderer`) owns the alert, next to its existing browser-title projection. `PendingInteractionNotifier.tsx` is a pure-props component; the app-shell assembly in `app.tsx` derives `alerts` from the sessions list store (`byId` entries with `pendingInteraction`) and wires `onOpen` to `sessions.open`. Every rising edge of the `sessionId:status` membership set plays a two-note WebAudio chime (oscillator-only, no audio asset, one lazily minted shared `AudioContext`) and, only while `document.hidden`, raises a system notification whose click focuses the window and opens the session. All three `PendingInteractionStatus` kinds alert through the same path. Browser autoplay and notification-permission policies require a prior user gesture, so a one-shot `pointerdown`/`keydown` listener resumes the audio context and requests notification permission while it is `default`. No server, wire, or runtime data-layer change: the manager already tracks pending interactions for never-opened sessions and replays them across reconnects.

## Alternatives considered

- **A callback in the runtime object layer (`SessionManager.trackPending`)** — would push browser side effects (audio, Notification) into the React-free data layer, against the client layering red lines; the shell snapshot edge needs no data-layer change.
- **An in-page Toast (the `ui-primitives` component exists)** — does not reach a user who has switched tabs, which is the reported failure; kept as the approval panel's job.
- **`document.title` flashing or favicon swap** — strictly weaker than a system notification and still silent; the taskbar flash on notification click comes free with the Notification API.
- **Request-level dedup via the request's stable key in the list projection** — would suppress the reconnect re-alert, but requires a runtime data-layer change; deferred because the re-alert reads as a legitimate "still pending after reconnect" reminder.
- **Chiming only while hidden too** — an approval blocks the turn even when the user is reading another part of the page; uniform rising-edge semantics are simpler and cost nothing.

## Consequences

Approvals, plan reviews, and questions are now audible and OS-visible with no server or protocol change; coverage is automatic for every current and future interaction kind carried by `pendingInteraction`. The costs: a reconnect replays still-pending requests, so the alert refires (documented in the package README's Known Limitations); a resolve-and-re-request pair coalesced into one snapshot publication can miss the empty intermediate state and skip one edge; and the first-gesture permission prompt reaches every web user once, not only those who hit approvals. Testing: a plain-props component spec covers edge detection, per-kind copy, visibility/permission gating, gesture arming, and missing-API tolerance; an assembly spec drives the real `SlotTestRuntime` to prove the `app.tsx` wiring and the notification-click-to-open path.
