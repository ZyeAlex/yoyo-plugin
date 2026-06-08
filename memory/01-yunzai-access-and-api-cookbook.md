# Yunzai 接入与 API 速查手册（yoyo 专用）

## 1. Yunzai 插件接入逻辑（运行时真相）

### 1.1 加载入口

- 核心加载器：`lib/plugins/loader.js`
- 加载目录：`/plugins/*`
- 入口规则：
  - 若插件目录存在 `index.js`，加载其导出（常见 `export { apps }`）
  - 否则直接扫描该目录 `.js` 文件

### 1.2 执行顺序

- `priority` 越小越先执行
- 同一消息处理顺序：
  1) 预处理 `dealEvent(e)`  
  2) 上下文 hook（`getContext`）  
  3) `accept`  
  4) `rule.reg` 匹配  
  5) `permission` 校验  
  6) 调用 `fnc`

### 1.3 事件对象 `e` 常用字段

- 文本与消息：`e.msg` `e.message` `e.raw_message` `e.img` `e.reply_id`
- 会话类型：`e.isGroup` `e.isPrivate` `e.group_id` `e.user_id`
- 权限相关：`e.isMaster` `e.sender.role` `e.member.is_admin/is_owner`
- 回复能力：`e.reply()` `e.group.recallMsg()` `e.friend.recallMsg()`
- 运行时：`e.runtime.render(...)`（渲染模板）

---

## 2. 基类 plugin API（来自 `lib/plugins/plugin.js`）

## 2.1 构造参数

- `name`: 插件名
- `dsc`: 描述
- `event`: 默认事件（默认 `message`）
- `priority`: 优先级（默认 `5000`）
- `rule`: 命令规则数组
- `task`: 定时任务配置
- `handler/namespace`: 事件总线扩展能力

### 2.2 rule 字段

- `reg`: `RegExp` 或字符串正则
- `fnc`: 方法名（class 风格）或包装后方法名（函数风格）
- `event`: 覆盖插件级事件
- `permission`: `master|owner|admin|all`
- `log`: `false` 关闭该规则日志

### 2.3 常用实例方法

- `reply(msg, quote=false, {recallMsg, at})`
- `setContext(type, isGroup?, time?, timeoutMsg?)`
- `getContext(type?, isGroup?)`
- `finish(type, isGroup?)`
- `awaitContext(...)`
- `renderImg(plugin, tpl, data, cfg)`（依赖 miao Common）

### 2.4 运行时常用全局/能力 API

- `segment`：消息段构造（`segment.image/segment.at/segment.reply`）
- `Bot`：全局机器人对象（日志、用户、群、工具函数）
- `redis`：缓存与短期状态存储
- `e.runtime.render(plugin, tpl, data, cfg)`：模板渲染入口
- `e.group.makeForwardMsg / e.friend.makeForwardMsg`：合并转发
- `e.group.getChatHistory / e.friend.getChatHistory`：历史消息
- `e.group.recallMsg / e.friend.recallMsg`：消息撤回

---

## 3. 事件名和权限写法速查

### 3.1 event 写法

- 消息：`message` `message.group` `message.private`
- 通知：`notice.group.increase` `notice.group.decrease` `notice.group.ban`
- 请求：`request.group.add` `request.group.invite` `request.friend`

### 3.2 permission 语义

- `master`: 仅主人
- `owner`: 群主
- `admin`: 管理员/群主
- `all`: 不限

> 注：Loader 已做一层权限拦截；业务层可再补 OneBot 能力校验。

### 3.3 返回值约定（控制匹配链）

- `return true`：当前功能处理完成（常见）
- `return false`：放行给后续规则继续匹配
- `accept` 返回 `"return"`：终止后续处理
- `accept` 返回 `true`：表示已消费该消息

---

## 4. 插件风格对照（用于读代码时快速定位）

- **TRSS 原生风格**：`class extends plugin` + `super({ rule })`  
  见：`plugins/system/*`, `plugins/genshin/apps/user.js`
- **miao App 风格**：`App.init().reg({ ... })`  
  见：`plugins/miao-plugin/apps/*.js`
- **rule 聚合风格**：`export rule + fn` 由框架装配  
  见：`plugins/xiaoyao-cvs-plugin/apps/index.js`
- **yoyo 包装器风格**：`plugin(config)` 自动绑定函数  
  见：`plugins/yoyo-plugin/utils/plugin.js`

---

## 5. yoyo-plugin 的 API 映射（后续开发只用这套）

### 5.1 imports 别名

- `#plugin` -> `utils/plugin.js`
- `#setting` -> `utils/setting.js`
- `#game` -> `utils/game.js`
- `#user` -> `utils/user.js`
- `#utils` -> `utils/index.js`
- `#render` -> `utils/render.js`

### 5.2 `#plugin` 包装器行为

- `rule.fnc` 可直接传函数引用
- 自动把函数挂到插件实例
- 字符串 `reg` 中的 `#` 自动替换成 `setting.rulePrefix`
- `func: [fn]` 可注册 `accept` 等非 rule 函数

### 5.3 `#setting` 配置读写

- `setting.getData(path, def, root='yoyo')`
- `setting.setData(path, data, root='yoyo')`
- `root='yunzai'` 时落地到 `Yunzai/data/yoyo-plugin/...`

### 5.4 `#render` 渲染

- `render(e, tpl, data, cfg?)`
- `saveRender(...)` 会记录 `message_id -> 原图 url` 到 redis

### 5.5 `#utils` 常用

- `checkPermission(e, permission, role, isReply)`
- `makeForwardMsg(e, msgArr, title)`
- `durationToSeconds(str)` / `getDate()` 等

### 5.6 `#game` 常用

- 数据对象：
  - `game.heros / game.pets / game.accessories / game.sets`
  - `game.heroIds / game.petIds / game.nicknames / game.heroImgs`
- 关键方法：
  - `game.getData(isInit?, type?)`：更新/加载 wiki 数据
  - `game.getHeroId(nameOrId)`：角色解析
  - `game.setHeroImgs(heroId, imageMsgs)`：下载保存角色图
  - `game.delHeroImg(heroId, fileList)`：删除角色图

---

## 6. 后续写功能的标准模板

```js
import plugin from "#plugin"
import utils from "#utils"

export const Demo = plugin({
  name: "[悠悠助手]示例功能",
  event: "message",
  priority: 100,
  rule: [
    { reg: "^#示例\\s*(.*)$", fnc: run, permission: "all" },
  ],
})

async function run(e, arg = "") {
  // 需要权限时再开：
  // await utils.checkPermission(e, "admin", "admin")
  await e.reply(`收到参数: ${arg || "空"}`)
}
```

---

## 7. 游戏插件开发约束（yoyo 专用）

- 默认不要引入群管理链路（踢/禁/撤不是核心域）
- 优先做：图鉴、账号、面板、签到、攻略、活动数据、渲染体验
- 涉及账号信息的功能必须：
  - 私聊优先
  - 错误信息脱敏
  - token/cookie 不写日志
  - 配置面可控（Guoba 开关）

