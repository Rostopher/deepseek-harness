# Agent Note: Web 待处理交互提醒——外壳拥有的提示音与系统通知

Status: implemented

[English](2026-08-14-web-pending-interaction-alerts.md) | 中文

## Problem

Web UI 中待处理的审批此前只有页面内的呈现：ApprovalPanel 占据输入区，以及侧边栏的琥珀色状态点（`SessionSummary.pendingInteraction`）。当浏览器标签页不在前台时两者都不可见，而仓库里不存在任何提醒机制——没有声音、没有 Notification API、没有标题闪烁——于是等待审批的 agent 会一直静默，直到用户恰好切回来。

## Decision

提醒由 Web 外壳（`@deepseek-ai/dsh-client-ui-renderer`）拥有，与既有的浏览器标题投影并列。`PendingInteractionNotifier.tsx` 是纯 props 组件；`app.tsx` 的 app-shell 组装从会话列表 store（带 `pendingInteraction` 的 `byId` 条目）派生 `alerts`，并把 `onOpen` 接到 `sessions.open`。`sessionId:status` 成员集合的每个上升沿都会播放一段双音 WebAudio 提示音（纯振荡器，无音频资源文件，共享一个惰性创建的 `AudioContext`），并且仅在 `document.hidden` 时弹出系统通知；点击通知会聚焦窗口并打开该会话。三种 `PendingInteractionStatus` 走同一条路径。浏览器的自动播放与通知权限策略要求先有用户手势，因此一次性的 `pointerdown`/`keydown` 监听会 resume 音频上下文，并在权限仍为 `default` 时请求通知权限。不改服务端、wire 与 runtime 数据层：manager 已经对从未打开的会话跟踪待处理交互，并在重连后重放。

## Alternatives considered

- **在 runtime 对象层加回调（`SessionManager.trackPending`）**——会把浏览器副作用（声音、Notification）推进无 React 的数据层，违背客户端分层红线；外壳快照的上升沿检测不需要任何数据层改动。
- **页面内 Toast（`ui-primitives` 已有现成组件）**——触达不到切走标签页的用户，而这正是被报告的问题；页面内呈现仍是审批面板自己的职责。
- **`document.title` 闪烁或替换 favicon**——严格弱于系统通知且仍然无声；通知点击带来的任务栏闪烁由 Notification API 免费提供。
- **把请求的稳定键暴露到列表投影以做请求级去重**——可以消除重连后的重复提醒，但需要改动 runtime 数据层；暂缓，因为重复提醒可读作"重连后仍未处理"的正当再提醒。
- **提示音也只在标签页隐藏时播放**——即使用户正在看页面的其它部分，审批同样阻塞本轮；统一的上升沿语义更简单且无额外代价。

## Consequences

审批、计划确认与提问现在可听且对操作系统可见，且没有任何服务端或协议改动；凡是经 `pendingInteraction` 承载的现存与未来交互种类都自动获得提醒。代价：重连会重放仍未解决的请求，提醒因此再触发一次（已记入该包 README 的已知限制）；被合并进同一次快照发布的"解决+新请求"可能跳过中间的消失状态而漏掉一个上升沿；首次手势的权限请求会触达每个 Web 用户一次，而不只是遇到审批的用户。测试：纯 props 组件规格覆盖边沿检测、按种类的文案、可见性/权限门禁、手势武装与 API 缺失容忍；装配规格经真实 `SlotTestRuntime` 验证 `app.tsx` 接线与通知点击打开会话的路径。
