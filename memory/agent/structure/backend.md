# 应用结构

最后更新：2026-06-16

## 分层（根目录 `src/`）

| 层 | 路径 | 职责 |
|----|------|------|
| 入口 | `src/main.py` | FastAPI app 工厂、CORS、路由挂载 |
| 路由 | `src/api/endpoints/` | HTTP 薄层 |
| 依赖 | `src/api/deps.py` | API Key 等 Depends |
| 配置 | `src/core/settings.py` | dotenv + 普通 class（见 code-style.md） |
| 服务 | `src/services/` | 业务编排（后续） |
| Harness | `src/harness/` | LangGraph Agent（后续） |

## HTTP API（当前）

| 方法 | 路径 |
|------|------|
| GET | `/v1/health` |

完整契约见 `requirements/contracts.md`。

## 启动

```bash
uv sync
uv run uvicorn src.main:app --reload --reload-dir src --host 0.0.0.0 --port 8000
uv run pytest
```
