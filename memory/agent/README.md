# YoAgent 开发记忆（Agent 专题）

最后更新：2026-06-24

> 本目录是 **yoyo-plugin `memory/` 的 Agent 子树**，原 `server/memory/` 已合并至此。  
> 插件侧对接见 [`../07-agent-integration.md`](../07-agent-integration.md)。  
> 日常开发导航见 [`../../server/AGENTS.md`](../../server/AGENTS.md)（若存在）。

## 用途

YoAgent（`server/`）的**单一事实基线**：需求、结构、进度。每文件保留**当前快照**；历史决策见 progress 专题，不堆叠过期「规划中」描述。

## 最近重大变更（2026-06-24）

**上下文与记忆重构** — 完整快照：[progress/phase-context-refactor-2026-06.md](progress/phase-context-refactor-2026-06.md)

- 删除关键词 IntentRoute / memory policy / intent regex 抽取
- `ContextAssembler` + `core.md` + `playbooks/` 结构信号组装
- 纯 ReAct + 渐进 `activate_tools`
- `memory/guards.py` + `memory/extract.py`
- 情绪仅本轮注入，**不写** users.yaml

## 渐进式披露（查阅顺序）

| 层级 | 何时读 | 路径 |
|------|--------|------|
| L0 | 新任务 | 本文 |
| L1 | 规则、架构、Token | [requirements/README.md](requirements/README.md) → [architecture.md](requirements/architecture.md) |
| L1b | 上下文/记忆/ReAct | [context-assembly.md](requirements/context-assembly.md) · [memory-system.md](requirements/memory-system.md) · [react-short-path.md](requirements/react-short-path.md) |
| L2 | 改代码 | [structure/code-style.md](structure/code-style.md) |
| L3 | 进度 | [progress/README.md](progress/README.md) |
| L4 | 踩坑 | `server/playbook/`（不进 memory） |

## 目录索引

```
memory/agent/
├── README.md
├── requirements/
├── structure/
├── references/       # 外部参照；部分描述为历史规划
└── progress/
```

## 与插件 memory 的分工

| 文档 | 内容 |
|------|------|
| [../07-agent-integration.md](../07-agent-integration.md) | HTTP 契约、配置、联调 |
| **本目录** | YoAgent 实现架构与进度 |
| [../04-wiki-data-and-cache.md](../04-wiki-data-and-cache.md) | 游戏 YAML 数据源 |

## 维护约定

| 变化 | 改哪里 |
|------|--------|
| 架构/记忆/ReAct 行为变更 | `requirements/` + `progress/phase-*.md` |
| 阶段状态 | `progress/phase-mvp-snapshot.md` |
| 插件对接 | `../07-agent-integration.md` |

**勿再文档化**已删除模块：`router.py`、`policy.py`、关键词 intent 文件。
