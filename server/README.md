# yoyo-sauce · QQ 群聊 Chat Brain

本目录即 `#安装悠悠` 拉取的后端（Gitee：`yoyo-plugin/yoyo-sauce`）。

## 启动

```bash
uv sync   # 或 python -m venv .venv && pip install -e 依赖见 pyproject.toml
uv run uvicorn src.main:app --host 0.0.0.0 --port 8787
```

## 接口

- `GET /api/health`
- `POST /api/chat` — 见插件仓 `docs/superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`

## 测试

```bash
.venv/bin/python -m pytest tests/ -v
```
