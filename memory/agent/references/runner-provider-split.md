# Runner 与 LLM Provider 分离

最后更新：2026-06-16

## 借鉴要点

AstrBot 分层：

- **`provider/`** — 调 OpenAI/Claude/Gemini 等，统一 `ProviderRequest` / 流式
- **`agent/runners/`** — 只管 step 循环、工具调度、状态机，不绑死某一模型

换模型不改 Loop；换 Loop 逻辑不改 Provider 适配。

## YoAgent 落点

| 模块 | 路径（规划） |
|------|--------------|
| LLM 调用 | 后续 `src/agent/` 内 provider/llm 模块，或薄封装于 execution |
| Tool Loop | `src/agent/execution/loop.py` |
| 配置 | `src/core/settings.py` — `OPENAI_MODEL` 等 |

## 硬约束

OpenAI 不锁死在 loop 内；Provider 接口便于日后加 Claude 等。

## 不照搬

AstrBot 20+ Provider 适配；YoAgent MVP 仅 OpenAI，保留接口形状即可。
