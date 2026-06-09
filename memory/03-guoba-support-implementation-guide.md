# yoyo-plugin Guoba 对接实现指南

> 目标：把 `config/config.yaml` 可视化到 Guoba，形成“改配置 -> 立即生效”的标准流程。

---

## 1. 标准接口结构（必须）

`guoba.support.js` 导出：

- `supportGuoba() => { pluginInfo, configInfo }`

其中：

- `pluginInfo`：插件元信息（名称、作者、仓库、图标）
- `configInfo.schemas`：表单 schema
- `configInfo.getConfigData()`：读配置给前端
- `configInfo.setConfigData(data, { Result })`：落盘并返回结果

参考实现：

- `plugins/Guoba-Plugin/guoba.support.js`（官方模板）
- `plugins/xiaoyao-cvs-plugin/guoba.support.js`（简版）
- `plugins/yoyo-plugin/guoba.support.js`（当前版）

---

## 2. schema 常见组件速查

- `SOFT_GROUP_BEGIN`：分组开始
- `Divider`：分割线/标题
- `Switch`：布尔
- `Input`：字符串
- `InputNumber`：数字
- `Select`：枚举
- `GTags`：字符串数组
- `GSelectGroup`：群选择
- `GSubForm`：对象数组（复杂配置）

---

## 3. yoyo 当前配置映射建议

## 3.1 已有且应保留

- 基础：
  - `config.rulePrefix`
- 图片：
  - `config.imgPath`
  - `config.characterImgPath`
  - `config.heroGuidePath`
  - `config.imgUpAuth`
  - `config.imgDelAuth`
  - `config.imgMaxSize`
- 签到：
  - `config.sign`
  - `config.signWithdrawal`
  - `config.signInclude`
  - `config.signExclude`

## 3.2 建议新增（账号模块）

建议在 `config/default.yaml` 先新增 `account` 组，再接 Guoba：

```yaml
account:
  enable: true
  qrLoginEnable: true
  qrLoginScope: private # private|group|all
  passwordLoginEnable: false
  loginTimeoutSec: 300
  autoRecallSec: 30
  saveRawCookie: false
```

Guoba 字段建议：

- `config.account.enable` -> Switch
- `config.account.qrLoginEnable` -> Switch
- `config.account.qrLoginScope` -> Select
- `config.account.passwordLoginEnable` -> Switch
- `config.account.loginTimeoutSec` -> InputNumber
- `config.account.autoRecallSec` -> InputNumber
- `config.account.saveRawCookie` -> Switch

---

## 4. setConfigData 的正确写法（重点）

当前 yoyo 做法是正确方向：

1) 把扁平 `keyPath` 还原到对象（`lodash.set`）  
2) 与原配置 merge  
3) 数组字段使用覆盖策略  
4) `setting.setData('config/config', next)` 落盘

建议再补两点：

- 配置校验（范围、枚举、必填）
- 敏感字段保护（例如 `apiKey` 不在 Guoba 回显）

---

## 5. GSubForm 复杂对象的处理经验

来自 `yezi-plugin` 的成熟实践可借鉴：

- 用 `normalizeGroupIdForView/Save` 做前后端格式转换
- 保存前做重复 key 校验（如重复群号）
- 错误直接 `Result.error("...")`，成功 `Result.ok`

这套同样可用于 yoyo 未来的复杂配置，如：

- 账号白名单群
- 多环境接口端点列表
- 多游戏数据源优先级

---

## 6. yoyo 接入 Guoba 的实施步骤

1. **先对齐配置文件**：把要暴露的键补到 `default.yaml`
2. **补 schema 分组**：基础/图片/签到/账号 四组
3. **实现读取**：`getConfigData` 返回 `config: setting.config`
4. **实现保存**：merge + 校验 + `setData`
5. **做回归测试**：
   - 前端改值后落盘是否正确
   - 重启后配置是否生效
   - 非法值是否被拦截

---

## 7. yoyo 专项注意事项

- 作为游戏插件，Guoba 面板应围绕“游戏功能配置”，不要扩展群管理域。
- `config/config.yaml` 中现有历史字段较多，建议按功能分组逐步收敛，不一次性暴露全部。
- 避免把任何密钥明文展示到 Guoba（如外部 AI key、第三方 token）。

---

## 8. 最小可用示例（账号组）

```js
{
  component: "SOFT_GROUP_BEGIN",
  label: "账号接入"
},
{
  field: "config.account.qrLoginEnable",
  label: "启用扫码登录",
  component: "Switch"
},
{
  field: "config.account.qrLoginScope",
  label: "扫码登录场景",
  component: "Select",
  componentProps: {
    options: [
      { label: "仅私聊", value: "private" },
      { label: "仅群聊", value: "group" },
      { label: "私聊+群聊", value: "all" }
    ]
  }
}
```

