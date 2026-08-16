# Agent Note: Anthropic-route model discovery and /v1 segment ownership

Status: implemented

English | [中文](2026-08-16-anthropic-route-model-discovery.zh.md)

## Problem

Model discovery interrogated only `openai-completions` and `openai-responses`, so a draft provider speaking `anthropic-messages` — the common case for new-api/one-api gateways fronting Anthropic — answered `DISCOVERY_UNSUPPORTED` and the settings surface fell back to hand-entering every model id. Two version-segment ambiguities compounded it: the probe asked only `{base}/models`, so a bare gateway host that lists exclusively under `/v1` reported failure; and an `anthropic-messages` route whose `baseURL` the user closed with `/v1` reached the wire doubled (`/v1/v1/messages`), because Anthropic's SDK appends the version segment itself while OpenAI's SDKs fold it into the base.

## Decision

`LISTABLE_PROTOCOLS` in `discovery.ts` gains `anthropic-messages`: a gateway speaking Anthropic for chat still exposes the OpenAI-shaped `GET /models` listing, and Anthropic's own endpoint lists at `/v1/models` (the official route is a catalog route that never reaches the probe). The single listing URL becomes `listingUrlCandidates`: a base already carrying a version segment (`…/v1`) is probed as-is only — appending would double it — while a base without one is tried bare first and then under `/v1`. Each candidate's verdict is a `ProbeOutcome` with a `retryable` flag: a connection fault indicts the host and is terminal, an HTTP refusal or a non-JSON body (a gateway's web console answering the bare path) lets the next candidate try, and an oversized reply is terminal. `resolveRouteModels` in `catalog.ts` strips a trailing `/v1` from an `anthropic-messages` route's `baseURL`, since the SDK owns that segment; a deployment path above the segment is kept.

## Alternatives considered

- **Keep `anthropic-messages` unsupported** — leaves the dominant gateway case hand-entering ids, which is the failure this action exists to prevent; the listing shape the gateway exposes is the same one already read.
- **Always probe both paths regardless of the base** — a base already carrying `/v1` would be asked at `/v1/v1/models` first, a guaranteed miss that costs a round trip and, on gateways that rate-limit, real budget.
- **Resolve the listing URL with `URL` semantics** — a deployment path such as `https://gateway.example/openai/v1` would lose its segments to path resolution; the base stays a prefix.
- **Strip `/v1` in the discovery probe instead of the catalog** — the probe never appends a version segment, so nothing there needs stripping; the doubling happens only where the Anthropic SDK builds request URLs, which is the catalog's resolved route.

## Consequences

Anthropic-speaking gateways and self-hosted servers now list their models in the settings surface like OpenAI-compatible ones, and a `…/v1` baseURL works on both SDK conventions instead of doubling on Anthropic. The costs: a bare base may pay one extra probe round trip (the failed candidate's body is cancelled, never read), and a failure message names the last candidate asked — the versioned path when both failed — which can point at `/v1/models` while the user's misconfiguration sits elsewhere. Testing: `discovery.spec.ts` covers the candidate ordering, the as-is probe of a versioned base, retryable versus terminal verdicts, and the anthropic listing; `catalog.spec.ts` pins the `/v1` strip and the preserved deployment path above it.
