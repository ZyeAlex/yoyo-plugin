## 目录

### setting 
> 存放所有与 `config` `data` 交互逻辑，并存储其状态
```js
import setting from '#setting'`
```
| 属性  |说明  | 示例 |
|---|---|---|
|setting.config|<font color=bluesky>配置</font>|请参考[config](./config/default.yaml)|
|setting.yunzaiPath|yunzai地址||
|setting.path|yoyo地址||
|setting.rulePrefix|前缀||
|setting.heros|角色信息|`{ 101003:{ name:'寒悠悠',id:101003,...... } }`|
|setting.heroIds|角色名称->角色ID|`{ 寒悠悠:101003,... }`|
|setting.nicknames|角色昵称|`{ 101003:['唐悠悠',...] }`|
|setting.heroImgs|角色图片|`{ 101003:[ 'c:/xxx.png','c:/yyy.png' ],...  }`|
|setting.pets|奇波信息|`{ 500001:{ name:'迅狼',id:500001,...... } }`|
|setting.petIds|奇波名称->奇波ID|`{ 迅狼:500001,... }`|
|setting.achievements|成就系统||
|setting.accessories|装备系统||
|setting.foods|食物系统||
|setting.buildings|建造系统||

| 方法 | 说明  |参数|返回值 |
|---|---|---|---|
|setting.getHeroId(heroName) |根据名称获取角色ID | 角色名/角色昵称/角色ID|角色ID / undefined|


### app
```js
import setting from '#setting' // 引入setting配置
import plugin from '#plugin' // 引入plugin函数
import render from '#render' // 引入rander函数
```

```js
export const Test = plugin({
    name: '[悠悠助手]测试模块',
    event: 'message',
    priority: 100,
    rule:[{
            reg: `^${setting.rulePrefix}?测试$`,
            fnc: test
        }]
})

function test(e,reg){
    logger.info(reg) // /^~?测试$/
}

```