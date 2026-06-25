# ReAct 链路（纯 ReAct，无关键词路由）

最后更新：2026-06-24

## 原则

**ReAct 是默认且唯一执行路径。** 模型通过 system 中的 tool catalog + playbook 决定是否调用工具；**不用**问候/游戏/搜索等 regex 预分流或预绑定工具。

闲聊仍可能 **0 工具**（模型直接输出 JSON 回复），但这是 LLM 选择，不是 server 侧 `direct` 短路径。

## 流程

```
AgentRunner.run
  → ContextAssembler.build(AssembleContext)
  → run_tool_loop(messages, registry, max_steps)
  → LoopResult(route=direct|tools)  # 仅 trace：是否用过业务工具
```

## Tool Loop 约束

| 约束 | 值 |
|------|-----|
| max_step | `agentMaxSteps`（默认 4） |
| 首轮 tools | `activate_tools` + 已激活业务工具 schema |
| 工具目录 | system 注入轻量 catalog；模型 `activate_tools` 或直接调用 |
| 工具结果 | 截断 `agentToolResultMaxChars` |
| 同参重复 | loop 内 dedupe 缓存 |
| max_step 用尽 | 追加 FINAL_PROMPT + json_schema 收尾 |

## 特殊 fallback（非路由）

| 场景 | 行为 |
|------|------|
| 表情包 | 若 tool_log 尝试过 emoticon 工具但 JSON 无效 → `_auto_emoticon_bubbles_from_store` |
| get_emoticon 成功无 JSON | 从 tool 消息 `send_path` 组 bubble |

## 刻意不做

- ~~IntentRoute 规则 / 小模型分类~~
- ~~`search_intent` 预绑定 web_search~~
- ~~`emoticon_intent` 预绑定 search/get~~
- ~~Observational Direct（首轮无 tools 试探）~~

## 代码落点

| 概念 | 文件 |
|------|------|
| 入口 | `src/agent/runner.py` |
| step 循环 | `src/agent/execution/loop.py` |
| 上下文 | `src/agent/context/assembler.py` |

## 验收（token 向）

- 典型闲聊：可能 0 tool_calls（trace `route=direct`）
- 含 1 工具：total LLM 调用 ≤ 2（工具轮 + 最终 JSON 轮）
- 非 legacy 模式：`system_chars` 显著低于旧版全量 `default.md`
