<img decoding="async" align=right src="https://gitee.com/yoyo-plugin/yoyo-icon/raw/master/tex_icon_hero_l_101003.png" width="300px">


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

- 插件开发中... 招募美工、招募开发...

- 插件交流群：[👉🏻加群讨论](https://qm.qq.com/q/Mk3jyhIqSm)

- 提交代码：

  > 请在 [GitHub](https://github.com/ZyeAlex/yoyo-plugin)  fork 本仓库，修改并测试完成后提交PR



## 插件功能

`yoyo-plugin`为查询「蓝色星原：旅谣」信息的插件，包括角色面板、角色图鉴、角色图片等一系列功能
<!-- ✅⬜️ -->
大致包含有：
- Wiki相关
  - ✅ `角色图鉴` 
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

2. 推荐使用git进行安装，方便后续升级，在Yunzai根目录内打开终端执行以下命令（不推荐clone GitHub仓库，该仓库为开发分支）
  - gitee

    ```shell
    git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-plugin.git ./plugins/yoyo-plugin
    ```
3. 安装环境
    ```shell
    pnpm install
    ```

4. 安装图片库（娱乐互动功能需要）

    ```shell
    git clone --depth=1 https://gitee.com/yoyo-plugin/yoyo-image.git ./plugins/yoyo-image
    ```
    > 你也可以使用三方图片库，配置 `plugins/yoyo-plugin/config/config.yaml` 下的 `imgPath`, 添加 `plugins/图片库名称` 即可

    > 如果想自己上传图片，请将图片拷贝至 `yoyo-plugin/resources/img/hero/` 下 , 文件夹以角色名命名


## 插件配置

> 推荐使用[锅巴插件](https://gitee.com/guoba-yunzai/guoba-plugin)配置本插件

---

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
