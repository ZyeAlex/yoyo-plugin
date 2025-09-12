# <center>  悠悠助手API说明文档 </center>

- ### 获取插件地址

```js
import setting from '#setting'
// 插件地址
setting.path
// 云崽地址
setting.yunzaiPath
```

- ### 获取配置信息
```js
import setting from '#setting'
// config/config.yaml下的配置
setting.config
```

- ### 获取角色信息

```js
    import setting from '#setting'
    // 角色信息 { 101003:{ name:'寒悠悠',id:101003,...... } }
    setting.heros
    // 根据名称获取角色ID  或 undefined
    setting.getHeroId(角色名/昵称/ID) 
```

- ### 获取角色图片
```js
    import setting from '#setting'
    // 角色图片列表 { 101003:[ 'c:/xxx.png','c:/yyy.png' ],...  }
    setting.heroImgs
```

- ### 获取奇波信息

```js
    import setting from '#setting'
    // 奇波信息 { 500001:{ name:'迅狼',id:500001,...... } }
    setting.pets
    // 根据名称获取角色ID { 迅狼:500001,... }
    setting.petIds
```