## 目录

### setting 
> 存放基础配置
```js
import setting from '#setting'
```
| 属性  |说明  | 示例 |
|---|---|---|
|setting.config|<font color=bluesky>配置</font>|请参考[config](./config/default.yaml)|
|setting.yunzaiPath|yunzai地址||
|game.path|yoyo地址||

| 方法 | 说明  |参数|返回值 |
|---|---|---|---|
|game.getData(yamlPath) | 获取YAML数据 | yaml地址 | 数据\|undefined |
|setting.setData(yamlPath,data) | 保存YAML数据 | yaml地址 , 数据 | boolean |

### game 
> 存放游戏内容数据
```js
import game from '#game'
```
| 属性  |说明  | 示例 |
|---|---|---|
|game.heros|角色信息|`{ 101003:{ name:'寒悠悠',id:101003,...... } }`|
|<font color=gray><s>game.heroIds</s></font>|<font color=gray><s>内部使用</s></font>| |
|game.nicknames|角色昵称|`{ 101003:['唐悠悠',...] }`|
|game.heroImgs|角色图片|`{ 101003:[ 'c:/xxx.png','c:/yyy.png' ],...  }`|
|game.pets|奇波信息|`{ 500001:{ name:'迅狼',id:500001,...... } }`|
|game.petIds|奇波名称->奇波ID|`{ 迅狼:500001,... }`|
|game.sets|套装列表||
|game.accessories|装备列表||
|game.achievements|成就系统||
|game.foods|食物系统||
|game.buildings|建造系统||

| 方法 | 说明  |参数|返回值 |
|---|---|---|---|
|game.getHeroId(heroName) |根据名称获取角色ID | 角色名/角色昵称/角色ID|角色ID / undefined|


### user


### app
```js
import game from '#game' // 引入setting配置
import plugin from '#plugin' // 引入plugin函数
import render from '#render' // 引入rander函数
```

```js
export const Test = plugin({
    name: '[悠悠助手]测试模块',
    event: 'message',
    priority: 100,
    rule:[{
            reg: `^${setting.rulePrefix}?(测试)(123)$`,
            fnc: test
        }]
})

function test(e,text1,text2){
    logger.info(text1,text2) // 测试 123
}

```

### 三方支持

> 感谢每一位开发者对本项目做出的贡献

- 三方图库支持

    - 加载图片库

        ```js
        // main.js
        import { img } from '../yoyo-plugin/interface.js'
        let path = 'plugins/yoyo-image' // 要添加的仓库地址，从Bot根路径开始
        img(path)
        ```
    - 图片库格式

      > 图片以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 图片格式

      > 图片无明确长宽要求，图片会默认居中裁切，人物位置居中即可。


- 三方立绘图支持

    - 加载图片库

        ```js
        // main.js
        import { characterImg } from '../yoyo-plugin/interface.js'
        let path = 'resources/lsxy/character-img' // 要添加的仓库地址，从Bot根路径开始
        characterImg(path)
        ```
    - 图片库格式

      > 图片以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 图片格式

      > 立绘图为透明背景、角色居中图片（参考官方立绘）

- 三方攻略库支持

    - 加载攻略库

        ```js
        // main.js
        import { guide } from '../yoyo-plugin/interface.js'
        let path = 'resources/lsxy/guide' // 要添加的仓库地址，从Bot根路径开始
        characterImg(path,'hero')
        ```
    - 攻略库格式

      > 攻略图以「角色名」或「角色ID」命名文件夹，命名需符合官方角色名规范，否则无法读取，推荐使用 「角色ID」来命名避免匹配错误

    - 攻略图格式

      > .png /.jpg /.gif /.webp /.bmp /.svg
