# Agent Note: 模型行能力编辑器——输入模态、推理档位与发现过滤

Status: implemented

[English](2026-08-16-model-capabilities-editor.md) | 中文

## Problem

Models 设置区此前只能编辑手工声明模型的 id、名称与 token 容量，而 host 解析器早已支持的两个字段只能去改 `settings.yaml`：`input`（输入模态列表）与 `reasoningEfforts`（继承 / 禁用 / 带各档位 wire 拼写的档位字典）。声明视觉模型或调整推理档位的用户必须离开 UI 去写 YAML，而非法的档位字典——空的，或除 `off` 外不提供任何档位——要等到路由被读取时才暴露。发现选择器还有第二个独立的缺口：网关列出数百个模型时，没有办法缩小或反选所选。

## Decision

行的折叠区（双语 locale 中由"Capacities/容量"改名为"Capabilities/能力"）在 `ModelListEditor.tsx` 新增两个下拉。模态下拉只写三种可表达的列表——继承（键缺席）、`['text']`、`['text','image']`——其它列表渲染为仅 YAML 可编辑的值且拒绝覆盖。推理下拉覆盖继承、`false` 与自定义字典；自定义字典以档位 chip 编辑，档位词表为 `REASONING_LEVELS`（`off`…`max`，与 llm-pi-ai 的 `THINKING_LEVEL_GATE` 在 host 侧固定的词表一致）；写入的 wire 拼写即档位名本身，已带外来拼写的键在其 chip 被关闭前原样保留，`off` 写为 `null`（不发送推理参数）。`DeepSeekModelsEditor.tsx` 的 `validateDeepSeekModels` 镜像 host 解析器，新增 `modelReasoningEmpty` 失败：已声明的字典必须提供至少一个 `off` 以外的档位。与此独立，发现选择器新增过滤框与反选动作；过滤只收窄视图而不动选取集，滚出视图的行保持其勾选。

## Alternatives considered

- **在 UI 内做自由 YAML 编辑**——等于以更差的校验复制 settings.yaml 编辑器；下拉覆盖可表达的情形，其余显式交还 YAML。
- **每个档位配一个 wire 拼写输入框**——绝大多数情形就是档位名本身，两种协议分派发的就是它；chip 让这一步一次点击完成，YAML 里录入的外来拼写在往返中原样保留。
- **用重写候选列表的方式过滤**——用户已勾选的行一旦离开视图就会被静默取消；仅收窄视图才能与反选组合而不令人意外。

## Consequences

视觉模态与推理档位现在无需离开设置 UI 即可声明，无法满足的档位字典在保存时以指名行号的方式失败，而非拖到路由读取时。代价：三种可表达选择之外的模态列表在行内只读（只能去 YAML 编辑）；推理词表在客户端重复了一份——这是有意为之，因为 wire 名属于协议而非 host。测试：`provider-form.client.spec.tsx` 覆盖两个下拉的写入、保留拼写的 chip 切换、空字典校验失败以及过滤/反选行为。
