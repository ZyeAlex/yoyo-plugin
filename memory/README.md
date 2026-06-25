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
| 悠悠 / YoAgent 对接（插件侧） | [07-agent-integration.md](./07-agent-integration.md) |
| YoAgent 实现（需求 / 架构 / 进度） | [agent/README.md](./agent/README.md) |
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
| 07 | [07-agent-integration.md](./07-agent-integration.md) | 悠悠 ↔ YoAgent 对接（插件侧 HTTP 契约与联调） |
| — | [agent/](./agent/README.md) | **YoAgent 子树**：Harness 需求、代码结构、进度、外部参照 |

---

## 文档分工

- **`memory/`**：插件架构、数据流、设计决策（给 AI / 深度开发）
- **`memory/agent/`**：YoAgent（`server/`）实现专题，原 `server/memory/` 已合并至此
- **`插件开发API说明.md`**：`#setting` / `#game` 等模块 API 表（给日常查参）

代码变更后，同步更新对应专题，不只改本页链接。
