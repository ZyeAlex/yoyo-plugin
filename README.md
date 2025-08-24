<img decoding="async" align=right src="./resources/UI/Atlas/HeroL/tex_icon_hero_l_101003.png" width="30%">


# <div align="center">悠悠助手 （ yoyo-plugin ）</div>

<div align="center"> <i>云崽QQ机器人的「蓝色星原：旅谣」插件</i> </div>
<br/>
<div align="center">

![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FZyeAlex%2Fyoyo-plugin%2Frefs%2Fheads%2Fmaster%2Fpackage.json&query=%24.version&label=最新版本)
[<img src="https://img.shields.io/badge/插件交流群-991709221-blue" />](https://qm.qq.com/q/y37cqiS4Ks)
<img src="https://gitee.com/yoyo-plugin/yoyo-plugin/badge/star.svg"/>

</div>
<div align="center"><img src="https://api.moedog.org/count/@ZyeAlex.readme"  /></div>



## 开发说明

- 插件开发中... 招募美工、招募美工、招募美工...

- 插件交流群：[👉🏻加群讨论](https://qm.qq.com/q/Mk3jyhIqSm)

- 提交代码：

  > 请在 [GitHub dev分支](https://github.com/ZyeAlex/yoyo-plugin/tree/dev)  fork 本仓库，修改并测试完成后提交PR



## 插件功能

`yoyo-plugin`为查询「蓝色星原：旅谣」信息的插件，包括角色面板、角色图鉴、角色图片等一系列功能
<!-- ✅⬜️ -->
大致包含有：
- Wiki相关
  - ✅ `角色列表` 
  - ✅ `{角色}图鉴`  
  - ⬜️ `{角色}攻略`
  - ✅ `{角色}技能`
  - ✅ `{角色}星赐`
  - ⬜️ `{角色}定弦`
  - ✅ `{角色}台词`
  - ✅ `{角色}图片列表`
  - ✅ `{角色}图片[编号]`
  - ✅ `上传{角色}图片(图片)`
  - ✅ `删除{角色}图片{编号}`
- 账号相关（需要等游戏上线）
  - ⬜️ `绑定UID`
  - ⬜️ `扫码登陆`
  - ⬜️ `更新面板`
  - ⬜️ `{角色}面板`
- 娱乐相关
  - ✅ `签到`
- 插件设置
  - ✅ `清除无效数据`
  - ✅ `悠悠更新`

> 具体功能可在安装插件后 通过 `悠悠帮助` 查看详细指令

---

## 安装方法 

1. 确保已部署 Yunzai Bot，如果未安装，推荐使用 [Lagrange](https://lgr.928100.xyz/docs/Win.html) + [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) 的机器人部署方案

2. 推荐使用git进行安装，方便后续升级，在Yunzai根目录内打开终端执行以下命令
  - gitee

    ```shell
    git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-plugin.git ./plugins/yoyo-plugin
    ```
  - github （ ↑ 与gitee 二选一即可 ）
    ```shell
    git clone --depth=1 https://github.com/ZyeAlex/yoyo-plugin.git ./plugins/yoyo-plugin
    ```

3. 安装环境
    ```shell
    pnpm install
    ```

4. 安装图片库

    > 详情请看注意事项

## 注意事项

- 本插件暂时不附带角色图片，要使用角色图片相关功能请自行添加图库

  - 拷贝图片 
    > 将图片拷贝至 `yoyo-plugin/resources/img/hero/` 下 , 文件夹以角色名命名
    1. 我提供的图片库： [yoyo-image](https://gitee.com/yoyo-plugin/yoyo-image) 
  - 上传图片
    - 插件提供 【 上传XX图片 】 指令，在群内上传图片即可


---


<a href="https://github.com/ZyeAlex/yoyo-plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ZyeAlex/yoyo-plugin" />
</a>


![Alt](https://repobeats.axiom.co/api/embed/2ea99ed765b7cbc37c5375c5644fe816096f3966.svg "Repobeats analytics image")



<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
