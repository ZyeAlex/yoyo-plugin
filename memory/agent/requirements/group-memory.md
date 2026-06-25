# 群记忆与自我迭代

**已废弃** — 请使用 [memory-system.md](memory-system.md) 与 [../progress/phase-context-refactor-2026-06.md](../progress/phase-context-refactor-2026-06.md)。

当前实现要点：

- 短期：`logs/YYYY-MM-DD.md`
- 长期：`MEMORY.md`（群 + global）、`users.yaml`（用户画像，**无 emotion 日志**）
- 程序性：`skills/*/SKILL.md`
- 写入：`memory` 工具 + 异步 `extract.py`；`memory/guards.py` 拦截 lore 错写
