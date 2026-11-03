# yoyo-plugin Memory 索引（游戏插件版）

> 目标：后续开发 `yoyo-plugin` 时，先看这份索引，再进入对应专题文档。  
> 定位：`yoyo-plugin` 是**游戏服务插件**，不以群管理为核心能力。

---

## 必读顺序

1. `docs/01-yunzai-access-and-api-cookbook.md`  
   - Yunzai 接入逻辑  
   - 插件 API 写法全集  
   - yoyo 当前封装（`#plugin/#setting/#render/#game/#utils`）对应关系

2. `docs/02-game-account-login-flow-design.md`  
   - 账号接入的可行链路  
   - 扫码登录/账号密码登录如何落地  
   - 对齐 miao / xiaoyao / genshin 的实现方式与风险控制

3. `docs/03-guoba-support-implementation-guide.md`  
   - `guoba.support.js` 标准结构  
   - `config/config.yaml` 与 Guoba 表单字段映射  
   - yoyo 后续如何按功能拆组接入 Guoba 面板

4. `docs/04-wiki-data-and-cache.md`  
   - Wiki SMW 数据拉取与 YAML 缓存  
   - 图鉴渲染磁盘缓存与 `#更新xxx数据` 失效规则  
   - 角色面板缓存预留（`panel` scope）

5. `docs/05-render-ui-styles.md`  
   - 角色图鉴右侧布局、立绘 stretch 规则  
   - 奇波特性条 / 技能最高级描述  
   - 签到页（无背景图、头像、历史卡片）  
   - **CSS 维护禁忌**（禁止误 checkout / 整文件覆盖）

6. `docs/06-yoyo-image-repo.md`  
   - 角色图片库路径 `resources/img/hero/`  
   - 即 **yoyo-image** 独立 Git 仓库（嵌套 `.git`，主仓 `.gitignore` 排除 `resources/img/`）  
   - 签到 / 随机图 / `#上传xx图片` 的数据落点

7. `docs/07-chat-brain-mainline.md`  
   - 群聊 Chat Brain：插件适配 vs `server/` 职责  
   - 同群单主线、should_respond、打断、异步工具、防刷屏（默认 1 气泡）

8. `docs/08-chat-brain-memory-layer.md`  
   - 画像 / 黑话 / session / 日誌 / 向量  
   - 注入预算、异步抽取、守卫；运行数据在 `server/data/memory/`

9. `docs/09-group-heat-transcript.md`  
   - 每条进 transcript；idle/observe 攒批→快模型接话门闩→人设；engaged 唯一 partner 短窗人设；空 replies / leave  
   - 规格：`docs/superpowers/specs/2026-10-27-addressivity-observe-design.md`

10. `docs/10-capabilities-and-stickers.md`  
   - help.yaml 能力自知 + 指令 skip；表情货架策略 B；发送频率见 §2.1 与规格 `2026-10-28-sticker-frequency-design.md`；纯媒体不 media_only

> 渐进式入口：[docs/README.md](./README.md)

---

## 当前结论（供快速记忆）

- **Wiki 数据**：列表（SMW / 分类成员）→ 详情页 wikitext → `{{xxx图鉴}}` 解析 → `data/game/*.yaml`；背景页 → `data/game/lore/*.yaml`（普罗米利亚、游戏信息整理合集）；Base 从 `模块:Icon/*` 拉取。详见 `04-wiki-data-and-cache.md`。
- **剧情特殊奇波**：`pet.yaml` 保留、`page` 含「（特殊）」的条目（目前仅苗鸡/菜鸡各 1 条，非异色）展示层过滤；见 `04-wiki-data-and-cache.md` §3.3。
- **图鉴渲染**：`apps/atlas.js` 传 `cache: 'atlas'`，截图落盘 `data/cache/render/atlas/`；`#更新xxx数据` 触发 `clearRenderCache`。
- **图鉴/签到 UI**：样式已定稿，见 `05-render-ui-styles.md`。**`hero/atlas.html` + `atlas.css` 已锁定**，非用户明确要求禁止改；崩坏时用 `docs/reference/hero-atlas.*` 100% 还原（MD5 见 §2.4）。
- **角色图片库（yoyo-image）**：独立 Git 仓 [gitee.com/yoyo-plugin/yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image)；维护者在 `resources/img/hero/` 内嵌开发并 push，**用户须手动 clone 到 `plugins/yoyo-image`**（或自上传）。详见 `06-yoyo-image-repo.md`。
- **面板渲染缓存**：`CACHE_SCOPE.PANEL` / `clearPanelCache(uid)` 已预留，待 `#更新面板` 接入。
- `miao-plugin` 主要是功能层和 `App.init().reg()` 写法示例，**不是账号登录主实现层**。
- 账号绑定主链路应参考：
  - `genshin/apps/user.js` + `genshin/model/user.js`（Cookie/UID/NoteUser/MysUser 体系）
  - `xiaoyao-cvs-plugin/apps/mhyTopUpLogin.js` + `model/mhyTopUpLogin.js`（扫码/账号密码登录）
- yoyo 后续建议：
  - 优先做“扫码登录（私聊优先）+ 轮询确认 + 最终落库”的稳定链路；
  - 密码登录仅作为可选高级能力，并且默认关闭。
- **Chat Brain（群聊）**：自研 yoyo-sauce（`server/`），**不接 DSH/Mem0/SnowLuma**；同群一条主线；`#安装悠悠` 拉仓。详见 `07-chat-brain-mainline.md`。
- **群聊记忆**：`server/src/chat/memory/`；落盘 `server/data/memory/`（按群隔离）；读同步注入、写异步抽取；默认 `chatMaxReplies: 1` 防刷屏。详见 `08-chat-brain-memory-layer.md`。
- **群记录 + partner/observe / dwelling**：每条进 `transcript.jsonl`；闲置/观察攒批+快模型门闩；dwell 内快判 `reply` 即进人设。节奏 = glance 间隔 + 防抖 + 两次决定开口的 `chatSpeakMinGapSec` 左端（不够就等、不丢）；被 `@` 不再另加反应延迟。快判「克制」= 少抢话（有人等你答→reply），不是刚说过就 silent。详见 `09`、addressivity、time-glance 规格。
- **能力自知**：`config/help.yaml` → system 注入（前缀 `rulePrefix[0]`，当前 `~`）+ 指令 skip。整页面板引导 `~`；闲聊专名走 lookup。表情货架按需。详见 `10`、`12`。
- **游戏命令与聊天分离**：`~图鉴` 等仍走 apps；Chat skip 来自 help.yaml。
- **游戏知识（MVP）**：L0 + L1 同步两段式；**不做**错 kind 跨类型兜底；靠 persona/system 教模型声明正确 lookup。persona.md mtime 热加载；改 mainline 仍须重启唯一 uvicorn。详见 `12-game-knowledge.md`。
- **联网搜索**：`web_search` / `web_fetch`，无 API Key。仅 Bing；搜完自动抓 Top1 正文。开关 `chatWebSearchEnabled`。详见 `07` §7.1。

---

## 使用规则（给未来自己）

- 新功能开发前，必须先确认：
  - 接入点（event/rule/permission）
  - 数据落点（YAML/Redis/DB）
  - 安全策略（私聊限制、敏感信息脱敏、超时撤回）
  - Guoba 是否需要同步增加配置项
- 文档更新原则：代码改动后同步更新对应专题文档，不只改索引。

