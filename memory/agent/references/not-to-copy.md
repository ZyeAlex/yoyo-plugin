# AstrBot 不照搬清单

最后更新：2026-06-16

## 架构

- 9 段 IM Pipeline 全量复制
- 整个 `astrbot/core/` 目录命名与分层
- LangGraph 改回纯 while-loop（YoAgent 保留 graph 可选）

## 功能域

- 多 IM 平台适配（QQ/TG/飞书…）— Yunzai 插件负责
- WebUI / Dashboard
- 1000+ 插件（Star）生态
- 内置 RAG 知识库（除非 YoAgent 后续明确需要）
- TTS / T2I / ResultDecorate 装饰链
- Dify / Coze 等第三方 Agent 平台 runner（MVP 不做）

## 工程

- 超大单文件 god module 风格（`astr_main_agent.py` 等）— YoAgent 保持模块小、可测
- Implicit planning 作为唯一规划方式 — YoAgent 保留显式 `planning/` 选项

## 记忆

- 完全照搬 AstrBot 的 conversation_mgr 而不接 Mem0 — YoAgent 长期记忆以 Mem0 + DB 为准
