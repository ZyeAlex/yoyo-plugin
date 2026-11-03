# yoyo-plugin 开发记忆库（渐进式阅读）

> 入口：[README.md](../README.md)  
> 原则：**按需深入**，不必一次读完。AI 与开发者均从此页定位专题。

---

## 第 0 层：30 秒定位

| 我要… | 读这个 |
|------|--------|
| 图鉴/签到 UI 布局、CSS 维护禁忌 | [05-render-ui-styles.md](./05-render-ui-styles.md) |
| 角色图鉴样式 100% 还原快照 | [reference/hero-atlas.css](./reference/hero-atlas.css) · [reference/README.md](./reference/README.md) |
| 图鉴数据从哪来、渲染缓存怎么失效 | [04-wiki-data-and-cache.md](./04-wiki-data-and-cache.md) |
| 角色图片库 / yoyo-image 仓库在哪 | [06-yoyo-image-repo.md](./06-yoyo-image-repo.md) |
| 写新命令、`#plugin` / `#render` / 权限 | [01-yunzai-access-and-api-cookbook.md](./01-yunzai-access-and-api-cookbook.md) |
| 账号绑定 / 扫码登录设计 | [02-game-account-login-flow-design.md](./02-game-account-login-flow-design.md) |
| Guoba 配置面板接入 | [03-guoba-support-implementation-guide.md](./03-guoba-support-implementation-guide.md) |
| 群聊 Chat Brain 主线 / 打断 / 工具 | [07-chat-brain-mainline.md](./07-chat-brain-mainline.md) |
| 群聊记忆层（画像/黑话/日誌/向量） | [08-chat-brain-memory-layer.md](./08-chat-brain-memory-layer.md) |
| 群记录 / 温度 / 快模型接话门闩 / 主动插嘴 | [09-group-heat-transcript.md](./09-group-heat-transcript.md) · [规格](./superpowers/specs/2026-10-27-addressivity-observe-design.md) |
| help 能力自知 / 表情货架 / 面板 HUD | [10-capabilities-and-stickers.md](./10-capabilities-and-stickers.md) |
| 群聊游戏知识 L0/L1（图鉴 lookup） | [12-game-knowledge.md](./12-game-knowledge.md) · [规格 2026-10-28](./superpowers/specs/2026-10-28-game-knowledge-injection-design.md) |
| 表情发送频率（别家调研 + 提示词试验） | [规格 2026-10-28](./superpowers/specs/2026-10-28-sticker-frequency-design.md) · 摘要在 [10](./10-capabilities-and-stickers.md) §2.1 |
| 开发追踪日志（调试完按清单删除） | [11-debug-trace-remove.md](./11-debug-trace-remove.md) |
| Chat Brain 正式规格（全文） | [superpowers/specs/2026-10-26-qq-group-chat-brain-design.md](./superpowers/specs/2026-10-26-qq-group-chat-brain-design.md) |
| 模块 API 速查表 | [插件开发API说明.md](../插件开发API说明.md) |

---

## 第 1 层：索引

完整必读顺序与「当前结论」见 [yunzai-plugin-api-memory.md](./yunzai-plugin-api-memory.md)。

---

## 第 2 层：专题文档

| 编号 | 文件 | 内容 |
|------|------|------|
| 01 | [01-yunzai-access-and-api-cookbook.md](./01-yunzai-access-and-api-cookbook.md) | Yunzai 接入、plugin API、yoyo 封装映射 |
| 02 | [02-game-account-login-flow-design.md](./02-game-account-login-flow-design.md) | 账号登录链路设计 |
| 03 | [03-guoba-support-implementation-guide.md](./03-guoba-support-implementation-guide.md) | Guoba support 实现 |
| 04 | [04-wiki-data-and-cache.md](./04-wiki-data-and-cache.md) | Wiki SMW 数据 + 图鉴渲染缓存 |
| 05 | [05-render-ui-styles.md](./05-render-ui-styles.md) | 角色/奇波图鉴 + 签到页 UI 样式定稿 |
| 06 | [06-yoyo-image-repo.md](./06-yoyo-image-repo.md) | 角色图片库 = `resources/img/hero/`（yoyo-image 嵌套 Git 仓） |
| 07 | [07-chat-brain-mainline.md](./07-chat-brain-mainline.md) | 群聊 Chat Brain：单主线、should_respond、打断、工具、联网搜索、插件↔server |
| 08 | [08-chat-brain-memory-layer.md](./08-chat-brain-memory-layer.md) | 群聊记忆层：落盘、注入、抽取、守卫、配置（≠ `server/data/memory` 运行数据） |
| 09 | [09-group-heat-transcript.md](./09-group-heat-transcript.md) | 群记录、出站 @、idle/engaged/observe；快模型厚判接话 + 人设薄判意愿；冷插嘴不升温 |
| 10 | [10-capabilities-and-stickers.md](./10-capabilities-and-stickers.md) | help.yaml 能力注入、指令派生、表情货架 B、发送频率试验、纯媒体走热度、配置 HUD |
| 11 | [11-debug-trace-remove.md](./11-debug-trace-remove.md) | 临时 `trace.jsonl`。调试结束按该文删除，不留开关 |
| 12 | [12-game-knowledge.md](./12-game-knowledge.md) | 游戏知识 L0 常驻 + L1 lookup/expand 两段式；配置键；L2/L3 非目标 |

---

## 文档分工

- **`docs/`**（本目录）：插件架构、数据流、设计决策（给 AI / 深度开发）；含专题 `01`–`12` 与 `superpowers/`
- **`server/data/memory/`**：Chat Brain **运行时**群记忆落盘（gitignore，勿提交；≠ 本开发文档库）
- **`插件开发API说明.md`**：`#setting` / `#game` 等模块 API 表（给日常查参）
- **`docs/superpowers/specs/`**：Chat Brain 正式规格；专题 07/08/09/10 是 agent 速查版

代码变更后，同步更新对应专题，不只改本页链接。
