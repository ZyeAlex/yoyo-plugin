# Tool Loop 核心语义

最后更新：2026-06-16

## 借鉴要点

AstrBot 核心不是 LangGraph，而是 **ToolLoopAgentRunner**：

```
IDLE → RUNNING → DONE | ERROR
```

每轮 `step()`：

1. 压缩上下文
2. 调 LLM（可流式）
3. 无 tool call → DONE，返回文本
4. 有 tool call → 执行 → 结果 append 到 messages → 继续
5. 达到 max_step → 禁用工具，强制总结回复

Planning **隐含在 LLM 每步**，无独立 Planning 图。

## YoAgent 采纳

| 项 | 建议值 |
|----|--------|
| 状态机 | IDLE / RUNNING / DONE / ERROR |
| max_step 默认 | 8（可配置；AstrBot 默认 30，群聊宜更短） |
| max_step 收尾 | 去工具 + 注入「请总结回复」+ 最后一轮 |

## YoAgent 落点

- `src/agent/execution/loop.py` — step / step_until_done
- `src/agent/execution/graph.py` — LangGraph 编排（可选包一层 loop）

## YoAgent 可差异

YoAgent 可保留显式 `planning/` 节点；AstrBot 完全隐式。
