# yoyo-plugin Memory 索引（游戏插件版）

> 目标：后续开发 `yoyo-plugin` 时，先看这份索引，再进入对应专题文档。  
> 定位：`yoyo-plugin` 是**游戏服务插件**，不以群管理为核心能力。

---

## 必读顺序

1. `memory/01-yunzai-access-and-api-cookbook.md`  
   - Yunzai 接入逻辑  
   - 插件 API 写法全集  
   - yoyo 当前封装（`#plugin/#setting/#render/#game/#utils`）对应关系

2. `memory/02-game-account-login-flow-design.md`  
   - 账号接入的可行链路  
   - 扫码登录/账号密码登录如何落地  
   - 对齐 miao / xiaoyao / genshin 的实现方式与风险控制

3. `memory/03-guoba-support-implementation-guide.md`  
   - `guoba.support.js` 标准结构  
   - `config/config.yaml` 与 Guoba 表单字段映射  
   - yoyo 后续如何按功能拆组接入 Guoba 面板

---

## 当前结论（供快速记忆）

- `miao-plugin` 主要是功能层和 `App.init().reg()` 写法示例，**不是账号登录主实现层**。
- 账号绑定主链路应参考：
  - `genshin/apps/user.js` + `genshin/model/user.js`（Cookie/UID/NoteUser/MysUser 体系）
  - `xiaoyao-cvs-plugin/apps/mhyTopUpLogin.js` + `model/mhyTopUpLogin.js`（扫码/账号密码登录）
- yoyo 后续建议：
  - 优先做“扫码登录（私聊优先）+ 轮询确认 + 最终落库”的稳定链路；
  - 密码登录仅作为可选高级能力，并且默认关闭。

---

## 使用规则（给未来自己）

- 新功能开发前，必须先确认：
  - 接入点（event/rule/permission）
  - 数据落点（YAML/Redis/DB）
  - 安全策略（私聊限制、敏感信息脱敏、超时撤回）
  - Guoba 是否需要同步增加配置项
- 文档更新原则：代码改动后同步更新对应专题文档，不只改索引。

