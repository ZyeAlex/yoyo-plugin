# <center>  悠悠助手API说明文档 </center>

## 一、文件配置

- ### 配置文件
    - 配置文件路径 `config/default/config.yaml`
    - 运行后会自动生成 `config/config.yaml`

- ### 配置读取
    - 引入setting `import setting from '#setting'`
    - 读取config文件配置信息 `setting.config`
    - 获取插件地址 
        - `setting.path`-yoyo地址 
        - `setting.yunzaiPath`-yunzai地址

- ### 网络请求
    - API路径 `api/`
    - 发起请求
        - 引入request `import { http } from '../utils/http.js'`
        - get请求 `http.get(url, params)`
        - post请求 `http.post(url, data)`


## 二、信息获取


- ### 获取角色信息

```js
    // 角色信息 { 101003:{ name:'寒悠悠',id:101003,...... } }
    setting.heros
    // 根据名称获取角色ID  或 undefined
    setting.getHeroId(角色名/昵称/ID，是否模糊匹配) 
```

- ### 获取角色图片
```js
    // 角色图片列表 { 101003:[ 'c:/xxx.png','c:/yyy.png' ],...  }
    setting.heroImgs
```

- ### 获取奇波信息

```js
    // 奇波信息 { 500001:{ name:'迅狼',id:500001,...... } }
    setting.pets
    // 根据名称获取角色ID { 迅狼:500001,... }
    setting.petIds
```