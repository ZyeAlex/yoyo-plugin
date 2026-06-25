# 仓库顶层

最后更新：2026-06-16

```
YoAgent/
├── src/              # FastAPI 应用（根目录直建，无 backend/）
│   ├── main.py
│   ├── api/
│   ├── core/
│   ├── services/     # 后续
│   └── harness/      # 后续 Agent 控制平面
├── tests/
├── pyproject.toml
├── playbook/         # 跨项目配方（独立 git，忽略）
├── memory/agent/     # YoAgent 开发记忆（插件仓 memory/ 子树）
└── AGENTS.md
```

业务 git 跟踪 `src/`、`tests/`、`pyproject.toml` 等；不采用 playbook 的 `backend/` 子目录模式。
