# Agent Note: Anthropic 路由的模型发现与 /v1 版本段归属

Status: implemented

[English](2026-08-16-anthropic-route-model-discovery.md) | 中文

## Problem

模型发现此前只探测 `openai-completions` 与 `openai-responses`，因此讲 `anthropic-messages` 的草稿提供方——new-api/one-api 这类网关前置 Anthropic 的常见情形——只会得到 `DISCOVERY_UNSUPPORTED`，设置界面只能退回手工逐个录入模型 id。两个版本段归属的歧义让问题更重：探测只问 `{base}/models`，只在 `/v1` 下提供列表的裸网关主机会直接报错；而用户把 `anthropic-messages` 路由的 `baseURL` 以 `/v1` 收尾时，请求到达 wire 会变成双份（`/v1/v1/messages`），因为 Anthropic 的 SDK 自己追加版本段，OpenAI 系 SDK 则把版本段折进 base。

## Decision

`discovery.ts` 的 `LISTABLE_PROTOCOLS` 加入 `anthropic-messages`：聊天上讲 Anthropic 的网关仍暴露 OpenAI 形状的 `GET /models` 列表，Anthropic 官方端点也在 `/v1/models` 提供列表（官方路由是 catalog 路由，永远不会走到探测）。单一列表 URL 改为 `listingUrlCandidates`：已带版本段的 base（`…/v1`）只按原样探测——再追加就成双份；不带版本段的 base 先试裸路径再试 `/v1` 下。每个候选的判定是带 `retryable` 标志的 `ProbeOutcome`：连接故障指向主机本身，是终态；HTTP 拒绝或非 JSON 响应体（网关的 Web 控制台回答了裸路径）让下一个候选继续；超限的响应是终态。`catalog.ts` 的 `resolveRouteModels` 会剥离 `anthropic-messages` 路由 `baseURL` 末尾的 `/v1`，因为该段归 SDK 所有；版本段之上的部署路径予以保留。

## Alternatives considered

- **维持 `anthropic-messages` 不受支持**——会让最主要的网关场景继续手工录入 id，而这正是该动作存在要消除的失败；网关暴露的列表形状与既有读取路径相同。
- **无论 base 如何都探测两条路径**——已带 `/v1` 的 base 会先被问 `/v1/v1/models`，这是一次必然落空的往返，在限流的网关上还要付出真实配额。
- **用 `URL` 语义解析列表 URL**——`https://gateway.example/openai/v1` 这类部署路径会在路径解析中丢掉段；base 保持为前缀。
- **在发现探测里剥离 `/v1` 而非 catalog**——探测自身从不追加版本段，那里没有需要剥离的东西；双份只发生在 Anthropic SDK 构造请求 URL 的地方，即 catalog 解析出的路由。

## Consequences

讲 Anthropic 的网关与自托管服务器现在能像 OpenAI 兼容端点一样在设置界面列出模型，`…/v1` 结尾的 baseURL 在两种 SDK 约定下都可用，不再在 Anthropic 上双份。代价：裸 base 可能多付一次探测往返（失败候选的响应体被取消而不读取）；失败信息指向最后一个被问的候选——两条都失败时是版本化路径——可能指着 `/v1/models`，而用户的配置错误其实在别处。测试：`discovery.spec.ts` 覆盖候选顺序、带版本段 base 的原样探测、可重试与终态判定以及 anthropic 列表；`catalog.spec.ts` 固定 `/v1` 剥离与其上部署路径的保留。
