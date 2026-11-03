# 群记录、出站 @、温度调度

日期：2026-10-27  
状态：群记录 / 出站 **仍有效**；§3 温度已被取代  
范围：`server/src/chat/` 与插件 `api/chat/reply.js`、`apps/chat.js`  
**温度现行规格** → [2026-10-27-idle-engaged-heat-design.md](./2026-10-27-idle-engaged-heat-design.md)

对照：麦麦心流与 DSH（归档 / 净化）。不接入这两套运行时。

## 1. 群记录

白名单里每条消息先写成一行可读文本，再决定开不开口。纯图片也记。

- 文件：`server/data/memory/group/{id}/transcript.jsonl`
- `[CQ:at,qq=,name=夜夜]` → `@夜夜`；图片 → `[图片]`
- 悠悠开口后追加 `悠悠: ...`
- 回复时「近期群聊」读这份记录（并上插件环里还没落盘的句子）。`session.jsonl` 仍只记悠悠说过的轮，给长期抽取用。

## 2. 出站 @

模型正文里的 `[CQ:at,qq=...]` 抽成 `mention`，协议串删掉。插件用 `segment.at(qq)` 发送。人设要求想 @ 人时只填 `mention`。

## 3. 温度（已迁移）

本节初版 cold/warm + 问句抬分 + warm 条数扣次 **已废弃**。  
现行：**idle / engaged + focus + engagement + 空 replies**，见  
[2026-10-27-idle-engaged-heat-design.md](./2026-10-27-idle-engaged-heat-design.md) 与专题 [09](../../09-group-heat-transcript.md)。
