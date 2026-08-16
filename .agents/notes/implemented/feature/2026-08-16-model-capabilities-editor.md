# Agent Note: Model-row capabilities editor — modalities, reasoning levels, discovery filter

Status: implemented

English | [中文](2026-08-16-model-capabilities-editor.zh.md)

## Problem

The Models settings section edited a hand-declared model's id, name, and token capacities, but two fields the host resolver already honored were reachable only by editing `settings.yaml`: `input` (the modality list) and `reasoningEfforts` (inherit / disabled / the level dict with per-level wire spellings). A user declaring a vision model or tuning reasoning levels had to leave the UI for YAML, and an invalid level dict — empty, or offering nothing beyond `off` — surfaced only when the route was later read. The discovery picker had a second, independent gap: a gateway listing hundreds of models offered no way to narrow or invert the selection.

## Decision

The row's disclosure (renamed "Capacities" → "Capabilities" in both locales) gains two selects in `ModelListEditor.tsx`. The modality select writes the three expressible lists — inherit (key absent), `['text']`, `['text','image']` — and renders any other list as a YAML-only value it refuses to clobber. The reasoning select covers inherit, `false`, and a custom dict edited as level chips over `REASONING_LEVELS` (`off`…`max`, the same vocabulary llm-pi-ai's `THINKING_LEVEL_GATE` pins host-side); the wire spelling written is the level's own name, a key already carrying a foreign spelling survives untouched until its chip is toggled off, and `off` is written as `null` (send nothing). `validateDeepSeekModels` in `DeepSeekModelsEditor.tsx` mirrors the host resolver with a new `modelReasoningEmpty` failure: a declared dict must offer at least one level beyond `off`. Independently, the discovery picker gains a filter box and an invert action; the filter narrows the view without touching the pick set, so a row scrolled out of sight keeps its check.

## Alternatives considered

- **Free-form YAML editing inside the UI** — duplicates the settings.yaml editor with worse validation; the selects cover the expressible cases and defer the rest to YAML explicitly.
- **A text input per level for the wire spelling** — the overwhelming case is the level spelling itself, which both protocol dispatches send; chips keep that one tap, and foreign spellings entered in YAML survive round trips.
- **Filtering by rewriting the candidate list** — would silently uncheck rows the user already picked once they leave the view; view-only narrowing composes with invert instead of surprising.

## Consequences

Vision modalities and reasoning levels are declarable without leaving the settings UI, and an unsatisfiable level dict fails at save time with a named row instead of at route-read time. The costs: a modality list outside the three expressible choices renders read-only in the row (editable only in YAML), and the reasoning vocabulary is duplicated client-side — by design, since the wire names are the protocol's, not the host's. Testing: `provider-form.client.spec.tsx` covers the selects' writes, chip toggling with spelling preservation, the empty-dict validation failure, and filter/invert behavior.
