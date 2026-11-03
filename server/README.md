# yoyo-sauce · QQ 群聊 Chat Brain

本目录即 `#安装悠悠` 拉取的后端（Gitee：`yoyo-plugin/yoyo-sauce`）。

## 启动

```bash
uv sync   # 或 python -m venv .venv && pip install -e 依赖见 pyproject.toml
uv run uvicorn src.main:app --host 0.0.0.0 --port 8787
```

## 接口

- `GET /api/health`
- `POST /api/chat` — 主线回复
- `GET /api/chat/pending` — 拉取 tool_done 等 outbox
- `POST /api/memory/reindex` — 重建某群向量（本机运维）
- `POST /api/media/ingest` — 只下载消息段里已有的 http(s) 图片。插件连 `127.0.0.1`；不要把 `chatPort` 暴露到公网。下载会拒绝回环、内网和链路本地地址（含 `169.254.169.254`），且不跟随重定向。

## 文档（agent）

- 入口：`../docs/README.md`
- 主线：`../docs/07-chat-brain-mainline.md`
- 记忆层：`../docs/08-chat-brain-memory-layer.md`
- 温度 / transcript：`../docs/09-group-heat-transcript.md`  
- idle/engaged 规格：`../docs/superpowers/specs/2026-10-27-idle-engaged-heat-design.md`
- 能力 / 表情：`../docs/10-capabilities-and-stickers.md`
- 正式规格：`../docs/superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`

运行时记忆数据：`data/memory/`（gitignore）。

## 测试

```bash
.venv/bin/python -m pytest tests/ -v
```
