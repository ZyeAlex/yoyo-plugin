# 游戏账号接入方案（yoyo-plugin）

> 目标：给 yoyo 增加“可维护”的账号接入流程，支持后续面板/签到/游戏数据读取。

---

## 1. 现状评估

### 1.1 yoyo 当前状态

- `apps/login.js` 仅有命令壳子（`#登录` / `#扫码登录`），未实现。
- `apps/account.js` 已有 UID 绑定切换逻辑，但缺少完整 Cookie/Stoken 接入链。

### 1.2 参考插件结论

- `miao-plugin`：偏功能层与渲染层（`App.init().reg()`），登录能力并不集中在 miao 自身。
- `genshin`：完整的账号绑定体系（`NoteUser/MysUser`、CK 状态检查、UID 映射）。
- `xiaoyao-cvs-plugin`：提供了扫码登录与账号密码登录完整样例（可直接借鉴流程）。

---

## 2. 可复用 API 证据链（重点）

## 2.1 扫码登录链（xiaoyao）

来源：`apps/mhyTopUpLogin.js` + `model/mhyTopUpLogin.js` + `model/mys/mihoyoApi.js`

- 触发：`#扫码登录`
- 过程：
  1) `qrCodeLogin` 获取 `url + ticket`
  2) 渲染二维码并发送（可 30s 自动撤回）
  3) 轮询 `qrCodeQuery` 直到 `Confirmed`
  4) 拿 `game_token` 换 `stoken/cookie`
  5) 调 `bindStoken` + `genshin/model/user.bing()` 完成落库

涉及接口（xiaoyao 的 type）：

- `qrCodeLogin`
- `qrCodeQuery`
- `getTokenByGameToken`
- `getCookieAccountInfoByGameToken`

## 2.2 账号密码登录链（xiaoyao）

- 触发：私聊 `#账号密码登录` -> 下一条 `账号xxx,密码yyy`
- 过程：
  1) `loginByPassword`
  2) 若命中风控（如 `retcode=-3101`），走 geetest 验证
  3) 获取 `stoken/cookie_token/ltoken`
  4) 同步绑定到 genshin 用户体系

风险：账号密码链路高敏感，不建议默认开启。

## 2.3 Cookie/Stoken 绑定链（genshin）

来源：`plugins/genshin/apps/user.js` + `model/user.js` + `model/mys/*`

- 自动识别 Cookie 文本（`accept`）
- 绑定后会：
  - 验证 CK 是否有效
  - 拉取 UID 列表（多游戏）
  - 保存 `NoteUser/MysUser` 关系
  - 支持 UID 主副切换、删除、状态检查

---

## 2.4 xiaoyao `miHoYoApi.getData(type)` 接口 type 全量速查

来源：`xiaoyao-cvs-plugin/model/mys/mihoyoApi.js`

- 游戏角色与签到：
  - `userGameInfo`：按 cookie 拉取已绑定游戏角色
  - `isSign`：查询签到状态
  - `sign`：执行签到
  - `home`：签到奖励列表
- 米游币任务：
  - `bbsisSign`：米游币任务状态/余额
  - `bbsSign`：社区签到
  - `bbsPostList`：帖子列表
  - `bbsPostFull`：帖子详情
  - `bbsVotePost`：点赞
  - `bbsShareConf`：分享任务
  - `bbsGetCaptcha` / `bbsCaptchaVerify` / `bbsValidate` / `geeType`：验证码相关
- Token/账号：
  - `bbsGetCookie`：`stoken -> cookie_token`
  - `bbsStoken`：`login_ticket -> stoken`
  - `getLtoken`：`stoken -> ltoken`
  - `loginByPassword`：账号密码登录
  - `validate` / `microgg` / `microggVl`：验证码服务
- 扫码登录：
  - `qrCodeLogin`：拉取二维码 URL + ticket
  - `qrCodeQuery`：轮询扫码状态
  - `getTokenByGameToken`：game_token 换 token
  - `getCookieAccountInfoByGameToken`：换 cookie_token
- 抽卡/充值：
  - `authKey`：获取 authkey
  - `goodsList`：商品列表
  - `createOrder`：创建充值订单
  - `checkOrder`：订单状态
- 云原神：
  - `cloudLogin`
  - `cloudReward`
  - `cloudGamer`
  - `cloudGet`

> 给 yoyo 的建议：先只接入“扫码登录链路最小子集”  
> `qrCodeLogin -> qrCodeQuery -> getTokenByGameToken -> getCookieAccountInfoByGameToken`

---

## 3. yoyo 的实现路线（建议分阶段）

## 3.1 Phase A（先做，低风险）

- 仅实现扫码登录（私聊优先）
- 登录成功后生成 `cookie + stoken`
- 接入 yoyo 自己的 `#user` 数据层（不要直接复制整套 genshin DB）

### 3.2 Phase B（可选）

- 加账号密码登录（默认关闭，Guoba 开关）
- 增加风控验证码流程
- 增加登录超时与尝试次数限制

### 3.3 Phase C（增强）

- 支持多 UID（官服/B服/国际服）绑定与切换
- 提供 `#我的账号` / `#删除账号` / `#账号状态` 命令
- 支持 token 刷新（失效自动提示）

---

## 4. yoyo 推荐数据模型

## 4.1 YAML（起步简单）

建议文件：`data/account/{qq}.yaml`

```yaml
qq: 123456
activeUid: "100123456"
accounts:
  - uid: "100123456"
    region: "cn_gf01"
    ltuid: "12345678"
    stoken: "..."
    ltoken: "..."
    cookie_token: "..."
    mid: ""
    updatedAt: 1740000000
```

## 4.2 Redis（短期状态）

- `yoyo:login:qr:{qq}`：二维码登录状态（ticket/device/step）
- `yoyo:login:poll:{qq}`：轮询锁，避免重复触发
- `yoyo:login:cooldown:{qq}`：冷却

---

## 5. 命令与流程设计（yoyo 建议）

### 5.1 命令面

- `#扫码登录`（核心）
- `#登录状态`
- `#我的账号`
- `#切换账号1`
- `#删除账号1`

### 5.2 规则约束

- 扫码登录默认仅私聊（群聊触发时提示去私聊）
- 每个用户同一时间只允许一个登录会话
- 轮询超时（建议 3~5 分钟）必须自动结束并清理 redis

---

## 6. 安全与合规要求（强约束）

- 不在日志打印完整 `cookie/stoken/apiKey/password`
- 登录二维码、登录结果消息默认短时撤回
- 群聊里不展示敏感结果
- 把“密码登录”作为可配置高级功能，默认关闭
- 明确免责声明，但不替代安全实现

---

## 7. 与 yoyo 现有代码的对接点

- `apps/login.js`：补全 `login/scanLogin` 实现
- `utils/user.js`：新增账号保存/切换/删除/状态方法
- `config/default.yaml`：新增 `account` 配置组
- `guoba.support.js`：新增账号配置面板（见文档 03）

---

## 8. 建议直接复用的实现片段

- 扫码轮询框架：参考 `xiaoyao model/mhyTopUpLogin.js` 的 `GetQrCode`
- 登录权限场景开关：参考 `Cfg.get("mhy.qrcode")` 的模式开关思路
- 绑定后落地逻辑：参考 `bindSkCK` 的“stoken + ck 双写入”

---

## 9. 上线前检查清单

- 能登录：扫码成功 -> 账号入库 -> 可查询
- 能失败：超时/取消/失效都有明确提示
- 能并发隔离：A 登录不影响 B
- 能恢复：重启后不丢持久数据
- 不泄漏：日志和群聊不输出敏感字段

