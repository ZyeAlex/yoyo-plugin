# 开发追踪日志（调试结束整段删除）

状态：**临时**。只为排查「为什么这句没开口 / 模型看到了什么」。  
调试结束后按下面清单删除，**不要**留开关。

群对白 `transcript.jsonl`、热度 `heat.json`、长期记忆 `session.jsonl` **不是**这套日志，删的时候别动。

## 落盘

`server/data/memory/group/{群号}/trace.jsonl`  
已在 `server/.gitignore` 的 `data/memory/**` 里，不进 Git。每群约 400 行后截断。图片 `data:` URL 会写成 `[omitted N chars]`。

一条消息按顺序可能有：

| event | 什么时候写 | 里面有什么 |
|-------|------------|------------|
| `decide` | 每次 `_choose_action` 给出 action/reason | 原文、发言人、`hard`、`kind`、`reason`、`heat_before` / `heat_after` |
| `judge` | 闲置/观察攒满，调用快模型判接话 | 完整 prompt、模型原文、`action` |
| `persona` | 人设模型返回后 | 请求 messages（已缩图）、模型原文、`reason`、模型名 |
| `sent` | 气泡确定要发出时 | 净化后的 `replies` |

没攒够、旁听、跟聊防抖，通常只有 `decide`。进程日志里同时有一行 `trace group=… event=… reason=… action=…`。

插件 `server/chat-plugin.debug.log` 是更早的接入日志（只有 hints / action / reason），**不属于**本清单。

## 删除清单

1. 删文件 `server/src/chat/trace.py`。
2. `server/src/chat/mainline.py`
   - 删 `from src.chat.trace import append_trace, shrink`
   - 删方法 `_write_trace`
   - 删全部 `self._write_trace(...)`（`_choose_action` 的 `decide`、`_judge` 的成功/失败、`_generate` 的 `persona` 和 `sent`）
   - `persona` 那次调用删掉后，`shrink(...)` 不再使用
3. `server/tests/test_heat_transcript.py`
   - 删 `from src.chat.trace import load_trace, shrink`
   - 删 `test_shrink_drops_data_urls`
   - `test_bystander_during_engaged_skips_without_persona` 里删 `load_trace` 那段断言；`observe_batch` 的行为断言留下
4. 删本文件，并去掉 [README.md](./README.md) 和 [09-group-heat-transcript.md](./09-group-heat-transcript.md) 里指向这里的行。
5. 运行数据可直接删目录里的 `trace.jsonl`（重启前删也行，不删只是占磁盘）。

删完后跑：

```bash
cd server && .venv/bin/python -m pytest tests/test_heat_transcript.py tests/test_heat_scenarios.py -q
```
